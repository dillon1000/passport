/**
 * Worker entrypoint: wires the HTTP app to Better Auth APIs and database-backed
 * OAuth metadata lookups. Route handlers receive the Cloudflare environment and
 * return public DTOs; auth policy stays with Better Auth unless this file is
 * already mutating a database-owned field. The entrypoint also injects
 * Cloudflare's custom-span tracer into the app boundary.
 */
import { tracing } from "cloudflare:workers";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import {
	createWorkerApp,
	type AccountPasswordInput,
	type AdminAuditEventSummary,
	type ApplicationSummary,
	type EmailNotificationPreferenceService,
	type OAuthClientSummary,
	type OAuthClientWithSecret,
	type PageInput,
	type PageResult,
	type WebhookEndpointSummary,
} from "./app";
import {
	cancelDataExportRequest,
	DataExportWorkflow,
	getCurrentDataExportRequest,
	requestDataExport,
	serveDataExportCancel,
	serveDataExportDownload,
} from "./data-export";
import { auth } from "../src/auth";
import { createDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { parseOAuthClientSeeds, type AuthEnv } from "../src/env";
import { auditMetadataJSON } from "../src/lib/admin-audit";
import { DEFAULT_EMAIL_NOTIFICATION_PREFERENCES } from "../src/lib/notification-preferences";
import { emitWebhookEvent, generateWebhookSecret, WEBHOOK_EVENT_TYPES } from "../src/lib/webhooks";
import {
	backchannelLogoutIssuer,
	buildLogoutTokenClaims,
} from "../src/lib/backchannel-logout";
import {
	consentMetadataFromRegisteredClient,
	consentMetadataFromSeedClient,
	type ConsentClientMetadata,
} from "../src/lib/oauth-client-metadata";
import {
	parseRequestLocation,
	requestLocationFromRequest,
} from "../src/lib/request-location";
import { mergeOAuthClientPassportFields } from "./oauth-client-fields";

export { DataExportWorkflow };
export { WebhookDeliveryWorkflow } from "./webhooks";

type OAuthClientAPIShape = {
	client_id: string;
	client_secret?: string;
	client_name?: string;
	client_uri?: string;
	logo_uri?: string;
	tos_uri?: string;
	policy_uri?: string;
	redirect_uris?: string[];
	post_logout_redirect_uris?: string[];
	scope?: string;
	public?: boolean;
	disabled?: boolean;
	skip_consent?: boolean;
	enable_end_session?: boolean;
};

type OAuthConsentAPIShape = {
	id: string;
	clientId: string;
	scopes?: string[];
	createdAt?: Date | string | null;
	updatedAt?: Date | string | null;
};

type AdminUserAPIShape = {
	id: string;
	email?: string | null;
	role?: string | null;
	banned?: boolean | null;
};

type LinkedAccountAPIShape = {
	providerId: string;
};

function toISOString(value: Date | string | null | undefined) {
	if (!value) return null;
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function scopesFrom(value: string | string[] | null | undefined) {
	if (Array.isArray(value)) return value;
	return value?.split(" ").map((scope) => scope.trim()).filter(Boolean) ?? [];
}

function mapOAuthClient(client: OAuthClientAPIShape): OAuthClientWithSecret {
	return {
		clientId: client.client_id,
		name: client.client_name ?? client.client_id,
		redirectUris: client.redirect_uris ?? [],
		postLogoutRedirectUris: client.post_logout_redirect_uris,
		scopes: scopesFrom(client.scope),
		uri: client.client_uri,
		icon: client.logo_uri,
		tos: client.tos_uri,
		policy: client.policy_uri,
		public: client.public,
		disabled: client.disabled,
		skipConsent: client.skip_consent,
		enableEndSession: client.enable_end_session,
		clientSecret: client.client_secret,
	};
}

function mapDatabaseClient(client: typeof schema.oauthClient.$inferSelect): OAuthClientSummary {
	return {
		clientId: client.clientId,
		name: client.name ?? client.clientId,
		redirectUris: client.redirectUris,
		postLogoutRedirectUris: client.postLogoutRedirectUris ?? undefined,
		scopes: client.scopes ?? undefined,
		uri: client.uri,
		icon: client.icon,
		tos: client.tos,
		policy: client.policy,
		public: client.public ?? undefined,
		disabled: client.disabled ?? undefined,
		skipConsent: client.skipConsent ?? undefined,
		enableEndSession: client.enableEndSession ?? undefined,
		backchannelLogoutUri: client.backchannelLogoutUri ?? null,
	};
}

function redactClientSecret(client: OAuthClientWithSecret): OAuthClientSummary {
	return {
		clientId: client.clientId,
		name: client.name,
		redirectUris: client.redirectUris,
		postLogoutRedirectUris: client.postLogoutRedirectUris,
		scopes: client.scopes,
		uri: client.uri,
		icon: client.icon,
		tos: client.tos,
		policy: client.policy,
		public: client.public,
		disabled: client.disabled,
		skipConsent: client.skipConsent,
		enableEndSession: client.enableEndSession,
		backchannelLogoutUri: client.backchannelLogoutUri ?? null,
	};
}

// Persists Passport-owned OAuth client columns that Better Auth's client APIs do
// not manage. Currently just the OIDC back-channel logout URI. Returns the
// stored value (or null when cleared) so callers can echo it back.
async function persistBackchannelLogoutUri(
	env: Env,
	clientId: string,
	uri: string | null | undefined,
) {
	if (uri === undefined) return undefined;
	await createDb(env as AuthEnv)
		.update(schema.oauthClient)
		.set({ backchannelLogoutUri: uri, updatedAt: new Date() })
		.where(eq(schema.oauthClient.clientId, clientId));
	return uri;
}

function pageOffset(page: PageInput) {
	return page.cursor === undefined ? 0 : Number(page.cursor);
}

function pageSlice<T>(items: T[], page: PageInput): PageResult<T> {
	const offset = pageOffset(page);
	const end = offset + page.limit;
	return {
		items: items.slice(offset, end),
		...(items.length > end ? { nextCursor: String(end) } : {}),
	};
}

function sortConsentsByMostRecent(consents: OAuthConsentAPIShape[]) {
	return [...consents].sort((a, b) =>
		String(b.updatedAt ?? b.createdAt ?? "").localeCompare(
			String(a.updatedAt ?? a.createdAt ?? ""),
		),
	);
}

async function getOAuthClientsByClientId(env: Env, clientIds: string[]) {
	if (clientIds.length === 0) {
		return new Map<string, OAuthClientSummary>();
	}

	const clients = await createDb(env as AuthEnv)
		.select()
		.from(schema.oauthClient)
		.where(inArray(schema.oauthClient.clientId, clientIds));
	return new Map(clients.map((client) => [client.clientId, mapDatabaseClient(client)]));
}

function requestIP(request: Request) {
	return (
		request.headers.get("cf-connecting-ip") ??
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		null
	);
}

function parseAuditMetadata(value: string | null | undefined) {
	if (!value) return undefined;
	try {
		return JSON.parse(value) as AdminAuditEventSummary["metadata"];
	} catch {
		return value;
	}
}

function mapWebhookEndpoint(
	row: typeof schema.webhookEndpoint.$inferSelect,
): WebhookEndpointSummary {
	return {
		id: row.id,
		url: row.url,
		events: row.events,
		description: row.description,
		disabled: row.disabled,
		createdAt: toISOString(row.createdAt) ?? new Date(0).toISOString(),
	};
}

function mapAuditEvent(event: typeof schema.adminAuditEvent.$inferSelect): AdminAuditEventSummary {
	return {
		id: event.id,
		createdAt: toISOString(event.createdAt) ?? new Date(0).toISOString(),
		actorUserId: event.actorUserId,
		actorEmail: event.actorEmail,
		actorRole: event.actorRole,
		action: event.action,
		targetType: event.targetType,
		targetId: event.targetId,
		targetLabel: event.targetLabel,
		organizationId: event.organizationId,
		ipAddress: event.ipAddress,
		location: parseRequestLocation(event.location),
		userAgent: event.userAgent,
		metadata: parseAuditMetadata(event.metadata),
	};
}

async function getAdminUser(
	env: Env,
	headers: Headers,
	userId: string,
): Promise<AdminUserAPIShape> {
	const user = (await auth(env as AuthEnv).api.getUser({
		headers,
		query: {
			id: userId,
		},
	})) as AdminUserAPIShape | null;
	return user ?? { id: userId };
}

/**
 * OIDC Back-Channel Logout fan-out. Given a user whose sessions have been
 * force-ended (e.g. an admin ban), POSTs a signed `logout_token` to every
 * connected client that (a) the user has an OAuth grant with and (b) has a
 * `backchannel_logout_uri` configured. Best-effort: per-client failures are
 * logged and never block the originating action. Sub-based logout ends all of
 * the user's sessions at each client.
 */
async function propagateBackchannelLogout(env: Env, userId: string) {
	try {
		const db = createDb(env as AuthEnv);
		const targets = await db
			.selectDistinct({
				clientId: schema.oauthConsent.clientId,
				uri: schema.oauthClient.backchannelLogoutUri,
			})
			.from(schema.oauthConsent)
			.innerJoin(
				schema.oauthClient,
				eq(schema.oauthConsent.clientId, schema.oauthClient.clientId),
			)
			.where(
				and(
					eq(schema.oauthConsent.userId, userId),
					isNotNull(schema.oauthClient.backchannelLogoutUri),
				),
			);
		if (targets.length === 0) return;

		const issuer = backchannelLogoutIssuer((env as AuthEnv).BETTER_AUTH_URL);
		const authInstance = auth(env as AuthEnv);
		for (const target of targets) {
			if (!target.uri) continue;
			try {
				const { token } = (await authInstance.api.signJWT({
					body: {
						payload: buildLogoutTokenClaims({
							issuer,
							audience: target.clientId,
							subject: userId,
						}),
					},
				})) as { token: string };
				await fetch(target.uri, {
					method: "POST",
					headers: { "content-type": "application/x-www-form-urlencoded" },
					body: new URLSearchParams({ logout_token: token }),
					signal: AbortSignal.timeout(10_000),
				});
			} catch (error) {
				console.warn(`Back-channel logout to ${target.clientId} failed.`, error);
			}
		}
	} catch (error) {
		console.warn("Back-channel logout propagation failed.", error);
	}
}

async function updateAccountPassword(
	request: Request,
	env: Env,
	input: AccountPasswordInput,
) {
	const authInstance = auth(env as AuthEnv);
	const accounts = (await authInstance.api.listUserAccounts({
		headers: request.headers,
	})) as LinkedAccountAPIShape[];
	const hasCredentialAccount = accounts.some((account) => account.providerId === "credential");

	if (hasCredentialAccount) {
		if (input.currentPassword === undefined) {
			return Response.json({ error: "Current password is required." }, { status: 400 });
		}
		return authInstance.api.changePassword({
			body: {
				currentPassword: input.currentPassword,
				newPassword: input.newPassword,
				revokeOtherSessions: true,
			},
			headers: request.headers,
			asResponse: true,
		});
	}

	return authInstance.api.setPassword({
		body: {
			newPassword: input.newPassword,
		},
		headers: request.headers,
		asResponse: true,
	});
}

async function getEmailNotificationPreferences(env: Env, userId: string) {
	const [row] = await createDb(env as AuthEnv)
		.select({
			securityAlerts: schema.emailNotificationPreference.securityAlerts,
		})
		.from(schema.emailNotificationPreference)
		.where(eq(schema.emailNotificationPreference.userId, userId))
		.limit(1);
	return row ?? DEFAULT_EMAIL_NOTIFICATION_PREFERENCES;
}

const emailNotificationPreferences: EmailNotificationPreferenceService = {
	get: async ({ env, session }) =>
		getEmailNotificationPreferences(env, session.user.id),
	update: async ({ env, session }, preferences) => {
		const [row] = await createDb(env as AuthEnv)
			.insert(schema.emailNotificationPreference)
			.values({
				userId: session.user.id,
				securityAlerts: preferences.securityAlerts,
			})
			.onConflictDoUpdate({
				target: schema.emailNotificationPreference.userId,
				set: {
					securityAlerts: preferences.securityAlerts,
					updatedAt: new Date(),
				},
			})
			.returning({
				securityAlerts: schema.emailNotificationPreference.securityAlerts,
			});
		return row ?? preferences;
	},
};

async function resolveConsentClientMetadata(
	env: Env,
	clientId: string,
): Promise<ConsentClientMetadata | null> {
	const db = createDb(env as AuthEnv);
	const [client] = await db
		.select()
		.from(schema.oauthClient)
		.where(eq(schema.oauthClient.clientId, clientId))
		.limit(1);
	if (client) {
		return consentMetadataFromRegisteredClient(mapDatabaseClient(client));
	}

	const seedClient = parseOAuthClientSeeds((env as AuthEnv).OAUTH_CLIENTS).find(
		(seed) => seed.id === clientId,
	);
	return seedClient ? consentMetadataFromSeedClient(seedClient) : null;
}

const app = createWorkerApp({
	tracer: tracing,
	authHandler: (request, env) => auth(env as AuthEnv).handler(request),
	agentConfiguration: ({ env }) => auth(env as AuthEnv).api.getAgentConfiguration(),
	getSession: (request, env) =>
		auth(env as AuthEnv).api.getSession({
			headers: request.headers,
		}),
	applications: {
		list: async ({ request, env }, page) => {
			const authInstance = auth(env as AuthEnv);
			const consents = (await authInstance.api.getOAuthConsents({
				headers: request.headers,
			})) as OAuthConsentAPIShape[];
			const sortedConsents = sortConsentsByMostRecent(consents);
			const visibleConsents = pageSlice(sortedConsents, page);
			const clientIds = [...new Set(visibleConsents.items.map((consent) => consent.clientId))];
			const clientsById = await getOAuthClientsByClientId(env, clientIds);
			const applications = visibleConsents.items.map<ApplicationSummary>((consent) => {
				const client = clientsById.get(consent.clientId);
				return {
					consentId: consent.id,
					clientId: consent.clientId,
					name: client?.name ?? consent.clientId,
					icon: client?.icon,
					uri: client?.uri,
					scopes: consent.scopes ?? [],
					authorizedAt: toISOString(consent.createdAt),
					updatedAt: toISOString(consent.updatedAt),
				};
			});

			return {
				items: applications,
				...(visibleConsents.nextCursor ? { nextCursor: visibleConsents.nextCursor } : {}),
			};
		},
		revoke: async ({ request, env, consentId }) => {
			await auth(env as AuthEnv).api.deleteOAuthConsent({
				headers: request.headers,
				body: {
					id: consentId,
				},
			});
		},
	},
	clientMetadata: {
		resolve: async ({ env }, clientId) => resolveConsentClientMetadata(env, clientId),
	},
	adminAudit: {
		list: async ({ env }, page) => {
			const offset = pageOffset(page);
			const rows = await createDb(env as AuthEnv)
				.select()
				.from(schema.adminAuditEvent)
				.orderBy(desc(schema.adminAuditEvent.createdAt))
				.limit(page.limit + 1)
				.offset(offset);
			const visibleRows = rows.slice(0, page.limit);
			return {
				items: visibleRows.map(mapAuditEvent),
				...(rows.length > page.limit ? { nextCursor: String(offset + page.limit) } : {}),
			};
		},
		record: async ({ request, env, session }, input) => {
			await createDb(env as AuthEnv).insert(schema.adminAuditEvent).values({
				id: crypto.randomUUID(),
				actorUserId: session.user.id,
				actorEmail: session.user.email,
				actorRole: session.user.role,
				action: input.action,
				targetType: input.targetType,
				targetId: input.targetId,
				targetLabel: input.targetLabel,
				organizationId: input.organizationId,
				ipAddress: requestIP(request),
				location: requestLocationFromRequest(request),
				userAgent: request.headers.get("user-agent"),
				metadata: auditMetadataJSON(input.metadata),
			});
		},
	},
	adminUsers: {
		setRole: async ({ request, env }, userId, role) => {
			await auth(env as AuthEnv).api.setRole({
				headers: request.headers,
				body: {
					userId,
					role,
				},
			});
			const user = await getAdminUser(env, request.headers, userId);
			await emitWebhookEvent(env as AuthEnv, createDb(env as AuthEnv), WEBHOOK_EVENT_TYPES.USER_ROLE_CHANGED, {
				userId: user.id,
				email: user.email,
				role: user.role ?? role,
			});
			return {
				userId: user.id,
				email: user.email,
				role: user.role ?? role,
			};
		},
		ban: async ({ request, env }, userId, input) => {
			await auth(env as AuthEnv).api.banUser({
				headers: request.headers,
				body: {
					userId,
					banReason: input.banReason,
					banExpiresIn: input.banExpiresIn,
				},
			});
			const user = await getAdminUser(env, request.headers, userId);
			await emitWebhookEvent(env as AuthEnv, createDb(env as AuthEnv), WEBHOOK_EVENT_TYPES.USER_BANNED, {
				userId: user.id,
				email: user.email,
				banReason: input.banReason ?? null,
			});
			await propagateBackchannelLogout(env, user.id);
			return {
				userId: user.id,
				email: user.email,
				banned: user.banned ?? true,
			};
		},
		unban: async ({ request, env }, userId) => {
			await auth(env as AuthEnv).api.unbanUser({
				headers: request.headers,
				body: {
					userId,
				},
			});
			const user = await getAdminUser(env, request.headers, userId);
			await emitWebhookEvent(env as AuthEnv, createDb(env as AuthEnv), WEBHOOK_EVENT_TYPES.USER_UNBANNED, {
				userId: user.id,
				email: user.email,
			});
			return {
				userId: user.id,
				email: user.email,
				banned: user.banned ?? false,
			};
		},
	},
	accountPassword: {
		update: ({ request, env }, input) => updateAccountPassword(request, env, input),
	},
	dataExports: {
		current: getCurrentDataExportRequest,
		request: requestDataExport,
		cancel: cancelDataExportRequest,
		cancelWithToken: serveDataExportCancel,
		downloadWithToken: serveDataExportDownload,
	},
	emailNotificationPreferences,
	activityLog: {
		list: async ({ env, session }, page) => {
			const offset = pageOffset(page);
			const rows = await createDb(env as AuthEnv)
				.select()
				.from(schema.accountActivityEvent)
				.where(eq(schema.accountActivityEvent.userId, session.user.id))
				.orderBy(desc(schema.accountActivityEvent.createdAt))
				.limit(page.limit + 1)
				.offset(offset);
			const visibleRows = rows.slice(0, page.limit);
			return {
				items: visibleRows.map((event) => ({
					id: event.id,
					type: event.type,
					createdAt: toISOString(event.createdAt) ?? new Date(0).toISOString(),
					ipAddress: event.ipAddress,
					location: parseRequestLocation(event.location),
					userAgent: event.userAgent,
				})),
				...(rows.length > page.limit ? { nextCursor: String(offset + page.limit) } : {}),
			};
		},
	},
	webhooks: {
		list: async ({ env }, page) => {
			const offset = pageOffset(page);
			const rows = await createDb(env as AuthEnv)
				.select()
				.from(schema.webhookEndpoint)
				.orderBy(desc(schema.webhookEndpoint.createdAt))
				.limit(page.limit + 1)
				.offset(offset);
			const visibleRows = rows.slice(0, page.limit);
			return {
				items: visibleRows.map(mapWebhookEndpoint),
				...(rows.length > page.limit ? { nextCursor: String(offset + page.limit) } : {}),
			};
		},
		create: async ({ env, session }, input) => {
			const secret = generateWebhookSecret();
			const [row] = await createDb(env as AuthEnv)
				.insert(schema.webhookEndpoint)
				.values({
					id: crypto.randomUUID(),
					url: input.url,
					secret,
					events: input.events,
					description: input.description ?? null,
					createdByUserId: session.user.id,
				})
				.returning();
			if (!row) throw new Error("Could not create webhook endpoint.");
			return { ...mapWebhookEndpoint(row), secret };
		},
		update: async ({ env }, id, input) => {
			const [row] = await createDb(env as AuthEnv)
				.update(schema.webhookEndpoint)
				.set({
					...(input.events ? { events: input.events } : {}),
					...(input.description !== undefined ? { description: input.description } : {}),
					...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
					updatedAt: new Date(),
				})
				.where(eq(schema.webhookEndpoint.id, id))
				.returning();
			return row ? mapWebhookEndpoint(row) : null;
		},
		remove: async ({ env }, id) => {
			const rows = await createDb(env as AuthEnv)
				.delete(schema.webhookEndpoint)
				.where(eq(schema.webhookEndpoint.id, id))
				.returning({ id: schema.webhookEndpoint.id });
			return rows.length > 0;
		},
		rotateSecret: async ({ env }, id) => {
			const secret = generateWebhookSecret();
			const [row] = await createDb(env as AuthEnv)
				.update(schema.webhookEndpoint)
				.set({ secret, updatedAt: new Date() })
				.where(eq(schema.webhookEndpoint.id, id))
				.returning();
			return row ? { ...mapWebhookEndpoint(row), secret } : null;
		},
		listDeliveries: async ({ env }, id, page) => {
			const offset = pageOffset(page);
			const rows = await createDb(env as AuthEnv)
				.select()
				.from(schema.webhookDelivery)
				.where(eq(schema.webhookDelivery.endpointId, id))
				.orderBy(desc(schema.webhookDelivery.createdAt))
				.limit(page.limit + 1)
				.offset(offset);
			const visibleRows = rows.slice(0, page.limit);
			return {
				items: visibleRows.map((row) => ({
					id: row.id,
					eventType: row.eventType,
					status: row.status,
					attempts: row.attempts,
					responseStatus: row.responseStatus,
					error: row.error,
					createdAt: toISOString(row.createdAt) ?? new Date(0).toISOString(),
					deliveredAt: toISOString(row.deliveredAt),
				})),
				...(rows.length > page.limit ? { nextCursor: String(offset + page.limit) } : {}),
			};
		},
	},
	adminOAuth: {
		list: async ({ request, env }, page) => {
			const clients =
				((await auth(env as AuthEnv).api.getOAuthClients({
					headers: request.headers,
				})) as OAuthClientAPIShape[] | null) ?? [];
			const result = pageSlice(
				clients.map((client) => redactClientSecret(mapOAuthClient(client))),
				page,
			);
			if (result.items.length === 0) return result;

			const passportFields = await createDb(env as AuthEnv)
				.select({
					clientId: schema.oauthClient.clientId,
					backchannelLogoutUri: schema.oauthClient.backchannelLogoutUri,
				})
				.from(schema.oauthClient)
				.where(
					inArray(
						schema.oauthClient.clientId,
						result.items.map((client) => client.clientId),
					),
				);
			return {
				...result,
				items: mergeOAuthClientPassportFields(result.items, passportFields),
			};
		},
		create: async ({ request, env }, input) => {
			const client = (await auth(env as AuthEnv).api.adminCreateOAuthClient({
				headers: request.headers,
				body: {
					redirect_uris: input.redirectUris,
					client_name: input.name,
					client_uri: input.uri,
					logo_uri: input.icon,
					tos_uri: input.tos,
					policy_uri: input.policy,
					post_logout_redirect_uris: input.postLogoutRedirectUris,
					scope: input.scopes?.join(" "),
					token_endpoint_auth_method: input.public ? "none" : "client_secret_basic",
					skip_consent: input.skipConsent,
					enable_end_session: input.enableEndSession,
				},
			})) as OAuthClientAPIShape;
			const created = mapOAuthClient(client);
			const storedUri = await persistBackchannelLogoutUri(
				env,
				created.clientId,
				input.backchannelLogoutUri,
			);
			return storedUri === undefined ? created : { ...created, backchannelLogoutUri: storedUri };
		},
		update: async ({ request, env }, clientId, input) => {
			const client = (await auth(env as AuthEnv).api.adminUpdateOAuthClient({
				headers: request.headers,
				body: {
					client_id: clientId,
					update: {
						redirect_uris: input.redirectUris,
						client_name: input.name,
						client_uri: input.uri,
						logo_uri: input.icon,
						tos_uri: input.tos,
						policy_uri: input.policy,
						post_logout_redirect_uris: input.postLogoutRedirectUris,
						scope: input.scopes?.join(" "),
						skip_consent: input.skipConsent,
						enable_end_session: input.enableEndSession,
					},
				},
			})) as OAuthClientAPIShape;
			const updated = redactClientSecret(mapOAuthClient(client));
			const storedUri = await persistBackchannelLogoutUri(env, clientId, input.backchannelLogoutUri);
			return storedUri === undefined ? updated : { ...updated, backchannelLogoutUri: storedUri };
		},
		rotateSecret: async ({ request, env }, clientId) => {
			const client = (await auth(env as AuthEnv).api.rotateClientSecret({
				headers: request.headers,
				body: {
					client_id: clientId,
				},
			})) as OAuthClientAPIShape;
			return mapOAuthClient(client);
		},
		setDisabled: async ({ env }, clientId, disabled) => {
			const db = createDb(env as AuthEnv);
			const [client] = await db
				.update(schema.oauthClient)
				.set({
					disabled,
					updatedAt: new Date(),
				})
				.where(eq(schema.oauthClient.clientId, clientId))
				.returning();
			if (!client) {
				throw new Error("OAuth client not found.");
			}
			return mapDatabaseClient(client);
		},
	},
});

export default app satisfies ExportedHandler<Env>;
