/**
 * Data export workflow and services. Inputs are authenticated request contexts
 * or signed email tokens; outputs are durable data-export rows, a private ZIP
 * object in R2, and short-lived download/cancel pages served by the Worker.
 * The DB row is the source of truth for cancellation and completion state.
 */
import { NonRetryableError } from "cloudflare:workflows";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { strToU8, Zip, ZipDeflate } from "fflate";

import { createDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import {
	DATA_EXPORT_STATUSES,
	type DataExportRequestSummary,
	type DataExportStatus,
	type DataExportWorkflowPayload,
} from "../src/lib/data-export";
import type { AuthEnv } from "../src/env";
import {
	sendDataExportReadyEmail,
	sendDataExportRequestedEmail,
} from "../src/email";
import {
	requestMetadataFromRequest,
	type RequestMetadata,
} from "../src/lib/request-metadata";
import { uploadStreamWithR2Multipart } from "./r2-multipart";

type DataExportContext = {
	request: Request;
	env: Env;
	session: {
		user: {
			id: string;
			email?: string | null;
		};
	};
};

type ExportFile = {
	name: string;
	bytes: Uint8Array;
};

type ExportObjectSource = {
	name: string;
	key: string;
};

type DataExportRow = typeof schema.dataExportRequest.$inferSelect;

const CANCEL_WINDOW_MS = 15 * 60 * 1000;
const DOWNLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;
const DATA_EXPORT_PREFIX = "data-exports";
const PROFILE_IMAGE_PREFIX = "profile-images";
const REDACTED = "[redacted]";

const ACCOUNT_REDACTED_FIELDS = [
	"accessToken",
	"refreshToken",
	"idToken",
	"password",
] as const;
const TWO_FACTOR_REDACTED_FIELDS = ["secret", "backupCodes"] as const;
const OAUTH_TOKEN_REDACTED_FIELDS = ["token"] as const;
const DATA_EXPORT_REDACTED_FIELDS = [
	"cancelTokenHash",
	"downloadTokenHash",
] as const;

function toISOString(value: Date | string | null | undefined) {
	if (!value) return null;
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dataExportStatus(value: string): DataExportStatus {
	return DATA_EXPORT_STATUSES.includes(value as DataExportStatus)
		? (value as DataExportStatus)
		: "failed";
}

export function mapDataExportRequest(row: DataExportRow): DataExportRequestSummary {
	return {
		id: row.id,
		status: dataExportStatus(row.status),
		requestedAt: toISOString(row.requestedAt) ?? new Date(0).toISOString(),
		cancelableUntil: toISOString(row.cancelableUntil) ?? new Date(0).toISOString(),
		canceledAt: toISOString(row.canceledAt),
		completedAt: toISOString(row.completedAt),
		expiresAt: toISOString(row.expiresAt),
		downloadedAt: toISOString(row.downloadedAt),
		errorMessage: row.errorMessage,
	};
}

function sanitizeRows<T extends object>(rows: T[], redactedFields: readonly string[] = []) {
	const redacted = new Set(redactedFields);
	return rows.map((row) =>
		Object.fromEntries(
			(Object.entries(row) as [string, unknown][]).map(([key, value]) => [
				key,
				redacted.has(key) && value !== null && value !== undefined ? REDACTED : value,
			]),
		),
	);
}

function jsonFile(name: string, value: unknown): ExportFile {
	return {
		name,
		bytes: strToU8(`${JSON.stringify(value, null, 2)}\n`),
	};
}

function randomToken() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

async function sha256Token(token: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return btoa(String.fromCharCode(...new Uint8Array(digest)))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function originFromRequest(request: Request, env: AuthEnv) {
	return env.BETTER_AUTH_URL || new URL(request.url).origin;
}

function dataExportObjectKey(userId: string, requestId: string) {
	return `${DATA_EXPORT_PREFIX}/${encodeURIComponent(userId)}/${requestId}.zip`;
}

function dataExportFilename(requestId: string) {
	return `passport-data-export-${requestId}.zip`;
}

function emailURL(baseURL: string, path: string, requestId: string, token: string) {
	const url = new URL(path.replace(":id", encodeURIComponent(requestId)), baseURL);
	url.searchParams.set("token", token);
	return url.toString();
}

async function latestDataExportRow(env: AuthEnv, userId: string) {
	const [row] = await createDb(env)
		.select()
		.from(schema.dataExportRequest)
		.where(eq(schema.dataExportRequest.userId, userId))
		.orderBy(desc(schema.dataExportRequest.requestedAt))
		.limit(1);
	return row ?? null;
}

export async function getCurrentDataExportRequest(context: DataExportContext) {
	const row = await latestDataExportRow(context.env as AuthEnv, context.session.user.id);
	return row ? mapDataExportRequest(row) : null;
}

export async function requestDataExport(context: DataExportContext) {
	const env = context.env as AuthEnv;
	const userId = context.session.user.id;
	const email = context.session.user.email;
	if (!email) {
		throw new Error("A verified account email is required before requesting a data export.");
	}

	const existingRequest = await latestDataExportRow(env, userId);
	if (existingRequest?.status === "pending" || existingRequest?.status === "processing") {
		return mapDataExportRequest(existingRequest);
	}

	const now = new Date();
	const requestId = crypto.randomUUID();
	const cancelToken = randomToken();
	const metadata = requestMetadataFromRequest(context.request, now);
	const r2Key = dataExportObjectKey(userId, requestId);
	const zipFilename = dataExportFilename(requestId);
	const workflowInstance = await env.DATA_EXPORT_WORKFLOW.create({
		id: requestId,
		params: {
			requestId,
			userId,
		},
	});

	const [row] = await createDb(env)
		.insert(schema.dataExportRequest)
		.values({
			id: requestId,
			userId,
			status: "pending",
			workflowInstanceId: workflowInstance.id,
			r2Key,
			zipFilename,
			cancelTokenHash: await sha256Token(cancelToken),
			requestedAt: now,
			cancelableUntil: new Date(now.getTime() + CANCEL_WINDOW_MS),
			requestIpAddress: metadata.ipAddress,
			requestLocation: metadata.location,
			requestUserAgent: metadata.userAgent,
			requestBrowser: metadata.browser,
			requestOperatingSystem: metadata.operatingSystem,
			requestDevice: metadata.device,
		})
		.returning();

	if (!row) throw new Error("Could not create data export request.");

	await sendDataExportRequestedEmail(
		env,
		email,
		emailURL(originFromRequest(context.request, env), "/api/data-export-requests/:id/cancel", requestId, cancelToken),
		metadata,
	);

	return mapDataExportRequest(row);
}

export async function cancelDataExportRequest(context: DataExportContext, requestId: string) {
	const env = context.env as AuthEnv;
	const now = new Date();
	const [row] = await createDb(env)
		.update(schema.dataExportRequest)
		.set({
			status: "canceled",
			canceledAt: now,
		})
		.where(
			and(
				eq(schema.dataExportRequest.id, requestId),
				eq(schema.dataExportRequest.userId, context.session.user.id),
				eq(schema.dataExportRequest.status, "pending"),
			),
		)
		.returning();
	if (!row) return null;
	return mapDataExportRequest(row);
}

async function cancelDataExportWithToken(env: AuthEnv, requestId: string, token: string) {
	const tokenHash = await sha256Token(token);
	const now = new Date();
	const [row] = await createDb(env)
		.update(schema.dataExportRequest)
		.set({
			status: "canceled",
			canceledAt: now,
		})
		.where(
			and(
				eq(schema.dataExportRequest.id, requestId),
				eq(schema.dataExportRequest.cancelTokenHash, tokenHash),
				eq(schema.dataExportRequest.status, "pending"),
			),
		)
		.returning();
	return row ?? null;
}

function htmlResponse(body: string, status = 200) {
	return new Response(body, {
		status,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}

function escapeHTML(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function tokenFromURL(request: Request) {
	return new URL(request.url).searchParams.get("token")?.trim() ?? "";
}

export async function serveDataExportCancel(request: Request, env: Env, requestId: string) {
	const token = tokenFromURL(request);
	if (!token) return htmlResponse("<h1>Missing cancel token</h1>", 400);

	if (request.method === "GET") {
		return htmlResponse(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cancel data export</title></head>
<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>Cancel data export?</h1>
<p>This stops the pending export before the archive is prepared.</p>
<form method="post"><input type="hidden" name="token" value="${escapeHTML(token)}"><button style="height:2.25rem;padding:0 .875rem;border-radius:.5rem;border:0;background:#171717;color:white">Cancel request</button></form>
</body>
</html>`);
	}

	if (request.method !== "POST") return new Response(null, { status: 405 });
	const form = await request.formData().catch(() => null);
	const postedToken = String(form?.get("token") ?? token).trim();
	const row = await cancelDataExportWithToken(env as AuthEnv, requestId, postedToken);
	return htmlResponse(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Data export ${row ? "canceled" : "not canceled"}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>${row ? "Data export canceled" : "Data export was not canceled"}</h1>
<p>${row ? "The pending export will not be prepared." : "The request may already be canceled, completed, expired, or the token is invalid."}</p>
</body>
</html>`, row ? 200 : 400);
}

export async function serveDataExportDownload(request: Request, env: Env, requestId: string) {
	const authEnv = env as AuthEnv;
	const token = tokenFromURL(request);
	if (!token) return htmlResponse("<h1>Missing download token</h1>", 400);

	const tokenHash = await sha256Token(token);
	const [row] = await createDb(authEnv)
		.select()
		.from(schema.dataExportRequest)
		.where(
			and(
				eq(schema.dataExportRequest.id, requestId),
				eq(schema.dataExportRequest.downloadTokenHash, tokenHash),
			),
		)
		.limit(1);
	if (!row || row.status !== "completed" || !row.r2Key || !row.zipFilename) {
		return htmlResponse("<h1>Data export is not available</h1>", 404);
	}
	if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
		return htmlResponse("<h1>Data export download expired</h1>", 410);
	}

	const url = new URL(request.url);
	if (url.searchParams.get("download") !== "1") {
		url.searchParams.set("download", "1");
		return htmlResponse(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Download data export</title></head>
<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>Your data export is ready</h1>
<p>This download page expires ${escapeHTML(row.expiresAt?.toLocaleString() ?? "soon")}.</p>
<p><a href="${escapeHTML(url.toString())}" style="display:inline-block;height:2.25rem;line-height:2.25rem;padding:0 .875rem;border-radius:.5rem;background:#171717;color:white;text-decoration:none">Download ZIP</a></p>
</body>
</html>`);
	}

	const object = await authEnv.DATA_EXPORTS.get(row.r2Key);
	if (!object) return htmlResponse("<h1>Data export archive was not found</h1>", 404);

	await createDb(authEnv)
		.update(schema.dataExportRequest)
		.set({ downloadedAt: new Date() })
		.where(eq(schema.dataExportRequest.id, row.id));

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("content-type", headers.get("content-type") ?? "application/zip");
	headers.set("content-disposition", `attachment; filename="${row.zipFilename}"`);
	headers.set("cache-control", "no-store");
	return new Response(object.body, { headers });
}

async function selectUserData(env: AuthEnv, userId: string) {
	const db = createDb(env);
	const [userRow] = await db.select().from(schema.user).where(eq(schema.user.id, userId)).limit(1);
	if (!userRow) throw new NonRetryableError("Data export user does not exist.");

	const [
		sessions,
		accounts,
		memberships,
		teamMemberships,
		sentInvitations,
		receivedInvitations,
		twoFactors,
		passkeys,
		agentHosts,
		agents,
		approvalRequests,
		oauthClients,
		oauthRefreshTokens,
		oauthAccessTokens,
		oauthConsents,
		adminAuditEvents,
		notificationPreferences,
		dataExportRequests,
	] = await Promise.all([
		db.select().from(schema.session).where(eq(schema.session.userId, userId)),
		db.select().from(schema.account).where(eq(schema.account.userId, userId)),
		db.select().from(schema.member).where(eq(schema.member.userId, userId)),
		db.select().from(schema.teamMember).where(eq(schema.teamMember.userId, userId)),
		db.select().from(schema.invitation).where(eq(schema.invitation.inviterId, userId)),
		db.select().from(schema.invitation).where(eq(schema.invitation.email, userRow.email)),
		db.select().from(schema.twoFactor).where(eq(schema.twoFactor.userId, userId)),
		db.select().from(schema.passkey).where(eq(schema.passkey.userId, userId)),
		db.select().from(schema.agentHost).where(eq(schema.agentHost.userId, userId)),
		db.select().from(schema.agent).where(eq(schema.agent.userId, userId)),
		db.select().from(schema.approvalRequest).where(eq(schema.approvalRequest.userId, userId)),
		db.select().from(schema.oauthClient).where(eq(schema.oauthClient.userId, userId)),
		db.select().from(schema.oauthRefreshToken).where(eq(schema.oauthRefreshToken.userId, userId)),
		db.select().from(schema.oauthAccessToken).where(eq(schema.oauthAccessToken.userId, userId)),
		db.select().from(schema.oauthConsent).where(eq(schema.oauthConsent.userId, userId)),
		db
			.select()
			.from(schema.adminAuditEvent)
			.where(
				or(
					eq(schema.adminAuditEvent.actorUserId, userId),
					eq(schema.adminAuditEvent.targetId, userId),
				),
			),
		db
			.select()
			.from(schema.emailNotificationPreference)
			.where(eq(schema.emailNotificationPreference.userId, userId)),
		db
			.select()
			.from(schema.dataExportRequest)
			.where(eq(schema.dataExportRequest.userId, userId)),
	]);

	const agentIds = agents.map((agent) => agent.id);
	const agentCapabilityGrants = agentIds.length
		? await db
				.select()
				.from(schema.agentCapabilityGrant)
				.where(
					or(
						inArray(schema.agentCapabilityGrant.agentId, agentIds),
						eq(schema.agentCapabilityGrant.deniedBy, userId),
						eq(schema.agentCapabilityGrant.grantedBy, userId),
					),
				)
		: await db
				.select()
				.from(schema.agentCapabilityGrant)
				.where(
					or(
						eq(schema.agentCapabilityGrant.deniedBy, userId),
						eq(schema.agentCapabilityGrant.grantedBy, userId),
					),
				);

	return {
		user: userRow,
		sessions,
		accounts,
		organizations: {
			memberships,
			teamMemberships,
			sentInvitations,
			receivedInvitations,
		},
		security: {
			twoFactors,
			passkeys,
		},
		agents: {
			agentHosts,
			agents,
			agentCapabilityGrants,
			approvalRequests,
		},
		oauth: {
			oauthClients,
			oauthRefreshTokens,
			oauthAccessTokens,
			oauthConsents,
		},
		adminAuditEvents,
		notificationPreferences,
		dataExportRequests,
	};
}

async function profileImageSources(env: AuthEnv, userId: string) {
	const prefix = `${PROFILE_IMAGE_PREFIX}/${encodeURIComponent(userId)}/`;
	const sources: ExportObjectSource[] = [];
	let cursor: string | undefined;
	do {
		const result = await env.PROFILE_IMAGES.list({
			prefix,
			...(cursor ? { cursor } : {}),
		});
		for (const object of result.objects) {
			sources.push({
				key: object.key,
				name: `profile-images/${object.key.slice(prefix.length)}`,
			});
		}
		cursor = result.truncated ? result.cursor : undefined;
	} while (cursor);
	return sources;
}

function dataExportFiles(userId: string, requestId: string, data: Awaited<ReturnType<typeof selectUserData>>) {
	const manifest = {
		exportedAt: new Date().toISOString(),
		requestId,
		userId,
		redactions: [
			"Credential secrets, OAuth tokens, password hashes, 2FA secrets, backup codes, and export token hashes are redacted.",
		],
	};

	return [
		jsonFile("manifest.json", manifest),
		jsonFile("user/profile.json", data.user),
		jsonFile("user/sessions.json", data.sessions),
		jsonFile("user/accounts.json", sanitizeRows(data.accounts, ACCOUNT_REDACTED_FIELDS)),
		jsonFile("organizations/memberships.json", data.organizations.memberships),
		jsonFile("organizations/team-memberships.json", data.organizations.teamMemberships),
		jsonFile("organizations/sent-invitations.json", data.organizations.sentInvitations),
		jsonFile("organizations/received-invitations.json", data.organizations.receivedInvitations),
		jsonFile(
			"security/two-factor.json",
			sanitizeRows(data.security.twoFactors, TWO_FACTOR_REDACTED_FIELDS),
		),
		jsonFile("security/passkeys.json", data.security.passkeys),
		jsonFile("agents/hosts.json", data.agents.agentHosts),
		jsonFile("agents/agents.json", data.agents.agents),
		jsonFile("agents/capability-grants.json", data.agents.agentCapabilityGrants),
		jsonFile("agents/approval-requests.json", data.agents.approvalRequests),
		jsonFile("oauth/clients.json", data.oauth.oauthClients),
		jsonFile(
			"oauth/refresh-tokens.json",
			sanitizeRows(data.oauth.oauthRefreshTokens, OAUTH_TOKEN_REDACTED_FIELDS),
		),
		jsonFile(
			"oauth/access-tokens.json",
			sanitizeRows(data.oauth.oauthAccessTokens, OAUTH_TOKEN_REDACTED_FIELDS),
		),
		jsonFile("oauth/consents.json", data.oauth.oauthConsents),
		jsonFile("audit/admin-audit-events.json", data.adminAuditEvents),
		jsonFile("settings/email-notifications.json", data.notificationPreferences),
		jsonFile(
			"privacy/data-export-requests.json",
			sanitizeRows(data.dataExportRequests, DATA_EXPORT_REDACTED_FIELDS),
		),
	];
}

function createZipStream(
	files: ExportFile[],
	imageSources: ExportObjectSource[],
	env: AuthEnv,
) {
	return new ReadableStream<Uint8Array>({
		async start(controller) {
			let closed = false;
			const zip = new Zip((error, chunk, final) => {
				if (error) {
					controller.error(error);
					closed = true;
					return;
				}
				if (chunk) controller.enqueue(chunk);
				if (final && !closed) {
					closed = true;
					controller.close();
				}
			});

			try {
				for (const file of files) {
					const entry = new ZipDeflate(file.name, { level: 6 });
					zip.add(entry);
					entry.push(file.bytes, true);
				}

				for (const source of imageSources) {
					const object = await env.PROFILE_IMAGES.get(source.key);
					if (!object?.body) continue;
					const entry = new ZipDeflate(source.name, { level: 6 });
					zip.add(entry);
					const reader = object.body.getReader();
					for (;;) {
						const read = await reader.read();
						if (read.done) break;
						entry.push(read.value, false);
					}
					entry.push(new Uint8Array(), true);
				}

				zip.end();
			} catch (error) {
				if (!closed) {
					closed = true;
					controller.error(error);
				}
			}
		},
	});
}

function metadataFromRow(row: DataExportRow): RequestMetadata {
	return {
		browser: row.requestBrowser ?? "Unknown browser",
		device: row.requestDevice ?? "Unknown device",
		ipAddress: row.requestIpAddress,
		location: row.requestLocation,
		locationLabel: [
			row.requestLocation?.city,
			row.requestLocation?.regionCode ?? row.requestLocation?.region,
			row.requestLocation?.country,
		]
			.filter(Boolean)
			.join(", ") || "Unknown location",
		operatingSystem: row.requestOperatingSystem ?? "Unknown operating system",
		time: toISOString(row.requestedAt) ?? new Date().toISOString(),
		userAgent: row.requestUserAgent,
	};
}

export class DataExportWorkflow extends WorkflowEntrypoint<AuthEnv, DataExportWorkflowPayload> {
	async run(event: WorkflowEvent<DataExportWorkflowPayload>, step: WorkflowStep) {
		const { requestId, userId } = event.payload;

		await step.sleep("wait 15 minutes for cancellation", "15 minutes");

		const requestRow = await step.do("mark data export processing", async () => {
			const [row] = await createDb(this.env)
				.update(schema.dataExportRequest)
				.set({ status: "processing" })
				.where(
					and(
						eq(schema.dataExportRequest.id, requestId),
						eq(schema.dataExportRequest.userId, userId),
						eq(schema.dataExportRequest.status, "pending"),
					),
				)
				.returning();
			return row ? mapDataExportRequest(row) : null;
		});

		if (!requestRow) return { status: "canceled" };

		try {
			const result = await step.do("write data export archive to R2", async () => {
				const [row] = await createDb(this.env)
					.select()
					.from(schema.dataExportRequest)
					.where(eq(schema.dataExportRequest.id, requestId))
					.limit(1);
				if (!row || row.status !== "processing" || !row.r2Key) {
					return { status: "canceled" };
				}

				const data = await selectUserData(this.env, userId);
				const files = dataExportFiles(userId, requestId, data);
				const imageSources = await profileImageSources(this.env, userId);
				files.push(
					jsonFile(
						"profile-images/manifest.json",
						imageSources.map((source) => ({ key: source.key, path: source.name })),
					),
				);

				await uploadStreamWithR2Multipart({
					bucket: this.env.DATA_EXPORTS,
					key: row.r2Key,
					stream: createZipStream(files, imageSources, this.env),
					options: {
						httpMetadata: {
							contentType: "application/zip",
						},
					},
				});

				return { status: "completed" };
			});

			if (result.status !== "completed") return result;

			return await step.do("mark data export complete and email download link", async () => {
				const completedAt = new Date();
				const expiresAt = new Date(completedAt.getTime() + DOWNLOAD_WINDOW_MS);
				const downloadToken = randomToken();
				const [row] = await createDb(this.env)
					.update(schema.dataExportRequest)
					.set({
						status: "completed",
						completedAt,
						expiresAt,
						downloadTokenHash: await sha256Token(downloadToken),
					})
					.where(
						and(
							eq(schema.dataExportRequest.id, requestId),
							eq(schema.dataExportRequest.status, "processing"),
						),
					)
					.returning();
				if (!row) return { status: "canceled" };

				const [user] = await createDb(this.env)
					.select({
						email: schema.user.email,
					})
					.from(schema.user)
					.where(eq(schema.user.id, userId))
					.limit(1);
				if (!user) throw new NonRetryableError("Data export user no longer exists.");

				await sendDataExportReadyEmail(
					this.env,
					user.email,
					emailURL(
						this.env.BETTER_AUTH_URL,
						"/api/data-export-requests/:id/download",
						requestId,
						downloadToken,
					),
					expiresAt.toISOString(),
					metadataFromRow(row),
				);

				return mapDataExportRequest(row);
			});
		} catch (error) {
			await step.do("mark data export failed", async () => {
				await createDb(this.env)
					.update(schema.dataExportRequest)
					.set({
						status: "failed",
						errorMessage: error instanceof Error ? error.message : "Unknown data export error.",
					})
					.where(eq(schema.dataExportRequest.id, requestId));
			});
			throw error;
		}
	}
}
