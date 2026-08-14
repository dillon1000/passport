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
	type BillingEntitlementRecord,
	type BillingLimitRecord,
	type BillingPlanRecord,
	type ApplicationSummary,
	type CreateOAuthClientInput,
	type EmailNotificationPreferenceService,
	type OAuthClientSummary,
	type OAuthClientWithSecret,
	type PageInput,
	type PageResult,
	type UpdateOAuthClientInput,
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
import { billingPlanCatalog, billingPlanCatalogEntry, catalogPriceIds } from "../src/lib/billing";
import {
	createBillingPlan,
	deleteBillingPlan,
	getBillingPlanById,
	listBillingPlans,
	loadBillingPlans,
	reorderBillingPlans,
	rowToDefinition,
	updateBillingPlan,
} from "../src/lib/billing-plan-store";
import {
	createEntitlement,
	createLimit,
	deleteEntitlement,
	deleteLimit,
	listEntitlements,
	listLimits,
	loadRegistryLabels,
	updateEntitlement,
	updateLimit,
	type BillingEntitlementRow,
	type BillingLimitRow,
} from "../src/lib/billing-registry-store";
import {
	applyStripeProvisioning,
	createOneTimeCheckout,
	listOneTimePurchases,
	resolveStripePrices,
} from "../src/lib/auth-server/stripe";
import { auditMetadataJSON } from "../src/lib/admin-audit";
import { DEFAULT_EMAIL_NOTIFICATION_PREFERENCES } from "../src/lib/notification-preferences";
import { parseAccountActivityMetadata } from "../src/lib/account-activity";
import { emitWebhookEvent, generateWebhookSecret, WEBHOOK_EVENT_TYPES } from "../src/lib/webhooks";
import {
	backchannelLogoutIssuer,
	buildLogoutTokenClaims,
} from "../src/lib/backchannel-logout";
import {
	BROWSER_OAUTH_GRANT_TYPES,
	MACHINE_OAUTH_GRANT_TYPES,
	hasClientCredentialsGrant,
	type OAuthGrantType,
} from "../src/lib/oauth-grants";
import {
	consentMetadataFromRegisteredClient,
	consentMetadataFromSeedClient,
	type ConsentClientMetadata,
} from "../src/lib/oauth-client-metadata";
import {
	PASSPORT_ALLOWED_AUDIENCES_METADATA_KEY,
	allowedAudiencesFromMetadata,
	metadataWithAllowedAudiences,
} from "../src/lib/oauth-resources";
import {
	parseRequestLocation,
	requestLocationFromRequest,
} from "../src/lib/request-location";
import { mergeOAuthClientPassportFields } from "./oauth-client-fields";
import { cleanupBillingActionIntents } from "./client-api";

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
	platform_admin_only?: boolean;
	skip_consent?: boolean;
	enable_end_session?: boolean;
	grant_types?: OAuthGrantType[];
	metadata?: unknown;
	[PASSPORT_ALLOWED_AUDIENCES_METADATA_KEY]?: unknown;
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
		platformAdminOnly: client.platform_admin_only,
		skipConsent: client.skip_consent,
		enableEndSession: client.enable_end_session,
		grantTypes: client.grant_types,
		allowedAudiences: allowedAudiencesFromMetadata(client),
		clientSecret: client.client_secret,
	};
}

function oauthGrantTypesFromDatabase(value: string[] | null | undefined) {
	return value?.filter((grant): grant is OAuthGrantType =>
		["authorization_code", "client_credentials", "refresh_token"].includes(grant),
	);
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
		platformAdminOnly: client.platformAdminOnly,
		skipConsent: client.skipConsent ?? undefined,
		enableEndSession: client.enableEndSession ?? undefined,
		backchannelLogoutUri: client.backchannelLogoutUri ?? null,
		grantTypes: oauthGrantTypesFromDatabase(client.grantTypes),
		allowedAudiences: allowedAudiencesFromMetadata(client.metadata),
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
		platformAdminOnly: client.platformAdminOnly,
		skipConsent: client.skipConsent,
		enableEndSession: client.enableEndSession,
		backchannelLogoutUri: client.backchannelLogoutUri ?? null,
		grantTypes: client.grantTypes,
		allowedAudiences: client.allowedAudiences,
	};
}

function base64URL(bytes: Uint8Array) {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function randomBase64URL(length: number) {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return base64URL(bytes);
}

async function sha256Base64URL(value: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return base64URL(new Uint8Array(digest));
}

function oauthClientMetadata(allowedAudiences: string[] | undefined) {
	return metadataWithAllowedAudiences(allowedAudiences);
}

async function createMachineOAuthClient(
	env: Env,
	session: { user: { id: string } },
	input: CreateOAuthClientInput,
) {
	const now = new Date();
	const clientId = `client_${randomBase64URL(18)}`;
	const clientSecret = randomBase64URL(32);
	const [client] = await createDb(env as AuthEnv)
		.insert(schema.oauthClient)
		.values({
			id: crypto.randomUUID(),
			clientId,
			clientSecret: await sha256Base64URL(clientSecret),
			name: input.name,
			uri: input.uri,
			icon: input.icon,
			tos: input.tos,
			policy: input.policy,
			redirectUris: [],
			postLogoutRedirectUris: input.postLogoutRedirectUris,
			scopes: input.scopes,
			grantTypes: [...MACHINE_OAUTH_GRANT_TYPES],
			responseTypes: [],
			tokenEndpointAuthMethod: "client_secret_basic",
			public: false,
			disabled: false,
			platformAdminOnly: input.platformAdminOnly ?? false,
			skipConsent: input.skipConsent,
			enableEndSession: false,
			userId: session.user.id,
			metadata: oauthClientMetadata(input.allowedAudiences),
			backchannelLogoutUri: input.backchannelLogoutUri ?? null,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	if (!client) {
		throw new Error("OAuth client could not be created.");
	}
	return {
		...mapDatabaseClient(client),
		clientSecret,
	};
}

async function updateMachineOAuthClient(
	env: Env,
	clientId: string,
	input: UpdateOAuthClientInput,
) {
	const update: Partial<typeof schema.oauthClient.$inferInsert> = {
		updatedAt: new Date(),
	};
	if (input.name !== undefined) update.name = input.name;
	if (input.uri !== undefined) update.uri = input.uri;
	if (input.icon !== undefined) update.icon = input.icon;
	if (input.tos !== undefined) update.tos = input.tos;
	if (input.policy !== undefined) update.policy = input.policy;
	if (input.redirectUris !== undefined) update.redirectUris = input.redirectUris;
	if (input.postLogoutRedirectUris !== undefined) {
		update.postLogoutRedirectUris = input.postLogoutRedirectUris;
	}
	if (input.scopes !== undefined) update.scopes = input.scopes;
	if (input.skipConsent !== undefined) update.skipConsent = input.skipConsent;
	if (input.platformAdminOnly !== undefined) {
		update.platformAdminOnly = input.platformAdminOnly;
	}
	if (input.enableEndSession !== undefined) update.enableEndSession = input.enableEndSession;
	if (input.grantTypes !== undefined) update.grantTypes = input.grantTypes;
	if (input.allowedAudiences !== undefined) {
		update.metadata = oauthClientMetadata(input.allowedAudiences);
	}
	if (input.backchannelLogoutUri !== undefined) {
		update.backchannelLogoutUri = input.backchannelLogoutUri;
	}

	const [client] = await createDb(env as AuthEnv)
		.update(schema.oauthClient)
		.set(update)
		.where(eq(schema.oauthClient.clientId, clientId))
		.returning();
	if (!client) {
		throw new Error("OAuth client not found.");
	}
	return mapDatabaseClient(client);
}

// Persists Passport-owned OAuth client columns that Better Auth's client APIs do
// not manage directly. Returns only the fields the caller provided so service
// responses can echo current state without another read.
async function persistOAuthClientPassportFields(
	env: Env,
	clientId: string,
	input: {
		backchannelLogoutUri?: string | null;
		grantTypes?: OAuthGrantType[];
		allowedAudiences?: string[];
		platformAdminOnly?: boolean;
	},
) {
	const update: Partial<typeof schema.oauthClient.$inferInsert> = {};
	if (input.backchannelLogoutUri !== undefined) {
		update.backchannelLogoutUri = input.backchannelLogoutUri;
	}
	if (input.grantTypes !== undefined) {
		update.grantTypes = input.grantTypes;
	}
	if (input.allowedAudiences !== undefined) {
		update.metadata = oauthClientMetadata(input.allowedAudiences);
	}
	if (input.platformAdminOnly !== undefined) {
		update.platformAdminOnly = input.platformAdminOnly;
	}
	if (Object.keys(update).length === 0) return undefined;
	await createDb(env as AuthEnv)
		.update(schema.oauthClient)
		.set({ ...update, updatedAt: new Date() })
		.where(eq(schema.oauthClient.clientId, clientId));
	return input;
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

function mapBillingPlanRow(
	row: typeof schema.billingPlan.$inferSelect,
): BillingPlanRecord {
	return {
		id: row.id,
		name: row.name,
		label: row.label,
		description: row.description,
		group: row.group,
		priceId: row.priceId,
		lookupKey: row.lookupKey,
		annualDiscountPriceId: row.annualDiscountPriceId,
		annualDiscountLookupKey: row.annualDiscountLookupKey,
		seatPriceId: row.seatPriceId,
		prorationBehavior: row.prorationBehavior,
		freeTrialDays: row.freeTrialDays,
		type: row.type,
		personalOnly: row.personalOnly,
		hidden: row.hidden,
		displayOrder: row.displayOrder,
		limits: row.limits ?? null,
		entitlements: row.entitlements ?? null,
		lineItems: row.lineItems ?? null,
	};
}

function mapEntitlementRow(row: BillingEntitlementRow): BillingEntitlementRecord {
	return { id: row.id, key: row.key, name: row.name, description: row.description };
}

function mapLimitRow(row: BillingLimitRow): BillingLimitRecord {
	return { id: row.id, key: row.key, name: row.name, unit: row.unit };
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
					metadata: parseAccountActivityMetadata(event.metadata),
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
	billingPlans: {
		catalog: async (env) => {
			const plans = await loadBillingPlans(env as AuthEnv, createDb(env as AuthEnv));
			const prices = await resolveStripePrices(env as AuthEnv, catalogPriceIds(plans));
			return Object.values(billingPlanCatalog(plans, prices));
		},
		product: async (env, id) => {
			const row = await getBillingPlanById(createDb(env as AuthEnv), id);
			if (!row) return null;
			const definition = rowToDefinition(row);
			const prices = await resolveStripePrices(env as AuthEnv, catalogPriceIds([definition]));
			return billingPlanCatalogEntry(definition, row.id, prices);
		},
		labels: async (env) => loadRegistryLabels(createDb(env as AuthEnv)),
		list: async (env) =>
			(await listBillingPlans(createDb(env as AuthEnv))).map(mapBillingPlanRow),
		create: async (env, input) => {
			// When the payload carries a `stripe` block, create the Stripe
			// Product/Price(s) first and persist the resulting `price_…` ids.
			const provisioned = await applyStripeProvisioning(env as AuthEnv, input);
			const row = await createBillingPlan(createDb(env as AuthEnv), provisioned);
			if (!row) throw new Error("Could not create billing plan.");
			return mapBillingPlanRow(row);
		},
		update: async (env, id, input) => {
			const row = await updateBillingPlan(createDb(env as AuthEnv), id, input);
			return row ? mapBillingPlanRow(row) : null;
		},
		remove: async (env, id) => {
			const row = await deleteBillingPlan(createDb(env as AuthEnv), id);
			return Boolean(row);
		},
		reorder: async (env, order) => reorderBillingPlans(createDb(env as AuthEnv), order),
		prices: async (env, ids) => resolveStripePrices(env as AuthEnv, ids),
	},
	billingRegistry: {
		entitlements: {
			list: async (env) =>
				(await listEntitlements(createDb(env as AuthEnv))).map(mapEntitlementRow),
			create: async (env, input) => {
				const row = await createEntitlement(createDb(env as AuthEnv), input);
				if (!row) throw new Error("Could not create entitlement.");
				return mapEntitlementRow(row);
			},
			update: async (env, id, input) => {
				const row = await updateEntitlement(createDb(env as AuthEnv), id, input);
				return row ? mapEntitlementRow(row) : null;
			},
			remove: async (env, id) =>
				Boolean(await deleteEntitlement(createDb(env as AuthEnv), id)),
		},
		limits: {
			list: async (env) => (await listLimits(createDb(env as AuthEnv))).map(mapLimitRow),
			create: async (env, input) => {
				const row = await createLimit(createDb(env as AuthEnv), input);
				if (!row) throw new Error("Could not create limit.");
				return mapLimitRow(row);
			},
			update: async (env, id, input) => {
				const row = await updateLimit(createDb(env as AuthEnv), id, input);
				return row ? mapLimitRow(row) : null;
			},
			remove: async (env, id) => Boolean(await deleteLimit(createDb(env as AuthEnv), id)),
		},
	},
	billingCheckout: {
		create: async (env, input) =>
			createOneTimeCheckout(env as AuthEnv, createDb(env as AuthEnv), input),
	},
	billingPurchases: {
		list: async (env, input) =>
			listOneTimePurchases(createDb(env as AuthEnv), input),
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
					grantTypes: schema.oauthClient.grantTypes,
					allowedAudiences: schema.oauthClient.metadata,
					platformAdminOnly: schema.oauthClient.platformAdminOnly,
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
				items: mergeOAuthClientPassportFields(
					result.items,
					passportFields.map((field) => ({
						clientId: field.clientId,
						backchannelLogoutUri: field.backchannelLogoutUri,
						grantTypes: oauthGrantTypesFromDatabase(field.grantTypes),
						allowedAudiences: allowedAudiencesFromMetadata(field.allowedAudiences),
						platformAdminOnly: field.platformAdminOnly,
					})),
				),
			};
		},
		create: async ({ request, env, session }, input) => {
			if (hasClientCredentialsGrant(input.grantTypes)) {
				return createMachineOAuthClient(env, session, input);
			}
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
					grant_types: input.grantTypes ?? [...BROWSER_OAUTH_GRANT_TYPES],
					skip_consent: input.skipConsent,
					enable_end_session: input.enableEndSession,
					metadata: oauthClientMetadata(input.allowedAudiences),
				},
			})) as OAuthClientAPIShape;
			const created = mapOAuthClient(client);
			const storedFields = await persistOAuthClientPassportFields(env, created.clientId, {
				backchannelLogoutUri: input.backchannelLogoutUri,
				grantTypes: input.grantTypes,
				allowedAudiences: input.allowedAudiences,
				platformAdminOnly: input.platformAdminOnly,
			});
			return storedFields === undefined ? created : { ...created, ...storedFields };
		},
		update: async ({ request, env }, clientId, input) => {
			if (hasClientCredentialsGrant(input.grantTypes)) {
				return updateMachineOAuthClient(env, clientId, input);
			}
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
						grant_types: input.grantTypes,
						skip_consent: input.skipConsent,
						enable_end_session: input.enableEndSession,
						metadata: oauthClientMetadata(input.allowedAudiences),
					},
				},
			})) as OAuthClientAPIShape;
			const updated = redactClientSecret(mapOAuthClient(client));
			const storedFields = await persistOAuthClientPassportFields(env, clientId, {
				backchannelLogoutUri: input.backchannelLogoutUri,
				grantTypes: input.grantTypes,
				allowedAudiences: input.allowedAudiences,
				platformAdminOnly: input.platformAdminOnly,
			});
			return storedFields === undefined ? updated : { ...updated, ...storedFields };
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

const worker = {
	fetch(request: Request, env: Env, context: ExecutionContext) {
		return app.fetch(request, env, context);
	},
	scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext) {
		context.waitUntil(cleanupBillingActionIntents(createDb(env as AuthEnv)));
	},
} satisfies ExportedHandler<Env>;

export default worker;
