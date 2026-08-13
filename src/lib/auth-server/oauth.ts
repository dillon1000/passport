/**
 * OAuth provider plugin construction. Inputs are runtime env, trusted-client
 * seed JSON, supported scope definitions, and user claim context from the
 * database; output is the configured Better Auth OAuth provider plugin.
 */
import { oauthProvider } from "@better-auth/oauth-provider";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import type { AuthEnv } from "../../env";
import { parseOAuthClientSeeds } from "../../env";
import { isAdminOperator } from "../admin-access";
import { clientAPIResourceIdentifier } from "../client-api-http";
import { OAUTH_GRANT_TYPES } from "../oauth-grants";
import {
	allowedAudiencesFromMetadata,
	assertOAuthClientResourceAccess,
	metadataWithAllowedAudiences,
	oauthResourceIdentifiers,
	parseOAuthResourceSeeds,
} from "../oauth-resources";
import {
	buildAccessTokenScopeClaims,
	buildIDTokenScopeClaims,
	buildUserInfoScopeClaims,
	loadOAuthClaimContext,
	oauthClaimsSupported,
	type OAuthClaimContext,
} from "../oauth-scope-claims";
import {
	CLIENT_REGISTRATION_ALLOWED_SCOPES,
	DELEGATED_CLIENT_API_SCOPES,
	DEFAULT_CLIENT_REGISTRATION_SCOPES,
	SUPPORTED_OAUTH_SCOPES,
	assertSupportedOAuthScopes,
	type SupportedOAuthScope,
} from "../oauth-scopes";
import type { AuthDatabase } from "./types";

const emptyOAuthClaimContext: OAuthClaimContext = {
	organizations: [],
	teams: [],
	policy: {
		roles: ["authenticated"],
		permissions: [],
		entitlements: [],
	},
	security: {
		passkeyEnabled: false,
	},
	connections: [],
	billingSubscriptions: [],
	billingPurchases: [],
	billingCatalog: {},
};

function supportedClientScopes(scopes: string[] | undefined) {
	if (!scopes) return undefined;
	assertSupportedOAuthScopes(scopes, "OAUTH_CLIENTS");
	return scopes as SupportedOAuthScope[];
}

function needsOAuthClaimContext(scopes: readonly string[]) {
	return scopes.some((scope) =>
		[
			"organizations",
			"organizations:ids",
			"organizations:roles",
			"teams",
			"teams:ids",
			"permissions",
			"account:security",
			"connections",
			"billing:status",
			"billing:subscriptions",
			"billing:purchases",
			"billing:entitlements",
			"billing:limits",
		].includes(scope),
	);
}

function clientIdFromBasicAuth(authorization: string | null) {
	if (!authorization?.startsWith("Basic ")) return undefined;
	try {
		const decoded = atob(authorization.slice("Basic ".length));
		const separator = decoded.indexOf(":");
		return separator === -1 ? decoded : decoded.slice(0, separator);
	} catch {
		return undefined;
	}
}

function tokenRequestValue(value: unknown) {
	return typeof value === "string" ? value : undefined;
}

function tokenRequestValues(value: unknown) {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string");
	}
	return typeof value === "string" ? value : undefined;
}

function oauthTokenRequestBody(value: unknown) {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function configuredOAuthResources(env: AuthEnv) {
	const clientAPIIdentifier = clientAPIResourceIdentifier(env.BETTER_AUTH_URL);
	return [
		{
			identifier: clientAPIIdentifier,
			name: "Passport Delegated Resource API",
			scopes: [...DELEGATED_CLIENT_API_SCOPES],
		},
		...parseOAuthResourceSeeds(env.OAUTH_RESOURCES).filter(
			(resource) => resource.identifier !== clientAPIIdentifier,
		),
	];
}

export function oauthResourceAuthorizationPlugin(env: AuthEnv, db: AuthDatabase) {
	const resources = configuredOAuthResources(env);

	return {
		id: "oauth-resource-authorization",
		hooks: {
			before: [
				{
					matcher: (ctx: { path?: string }) => ctx.path === "/oauth2/token",
					handler: createAuthMiddleware(async (ctx) => {
						const body = oauthTokenRequestBody(ctx.body);
						if (body.grant_type !== "client_credentials") return;

						const clientId =
							tokenRequestValue(body.client_id) ??
							clientIdFromBasicAuth(ctx.request?.headers.get("authorization") ?? null);
						if (!clientId) return;

						const [client] = await db
							.select({
								clientId: schema.oauthClient.clientId,
								scopes: schema.oauthClient.scopes,
								metadata: schema.oauthClient.metadata,
							})
							.from(schema.oauthClient)
							.where(eq(schema.oauthClient.clientId, clientId))
							.limit(1);
						if (!client) return;

						try {
							assertOAuthClientResourceAccess({
								resources,
								resource: tokenRequestValues(body.resource),
								allowedAudiences: allowedAudiencesFromMetadata(client.metadata),
								clientScopes: client.scopes ?? undefined,
								requestedScopes: tokenRequestValue(body.scope)?.split(" ").filter(Boolean),
							});
						} catch (error) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_request",
								error_description:
									error instanceof Error ? error.message : "invalid resource request",
							});
						}
					}),
				},
			],
		},
	};
}

export function oauthProviderPlugin(env: AuthEnv, db: AuthDatabase) {
	const resources = configuredOAuthResources(env);
	const validAudiences = [...new Set([
		env.BETTER_AUTH_URL,
		clientAPIResourceIdentifier(env.BETTER_AUTH_URL),
		...oauthResourceIdentifiers(resources),
	])];

	return oauthProvider({
		loginPage: "/sign-in",
		selectAccount: {
			page: "/select-account",
			// OAuth requests always need an explicit account subject, even when
			// the client has already received consent or can skip consent.
			shouldRedirect: () => true,
		},
		consentPage: "/consent",
		disabledPaths: ["/token"],
		grantTypes: [...OAUTH_GRANT_TYPES],
		clientCredentialGrantDefaultScopes: [],
		validAudiences,
		allowDynamicClientRegistration: true,
		clientRegistrationDefaultScopes: [...DEFAULT_CLIENT_REGISTRATION_SCOPES],
		clientRegistrationAllowedScopes: [...CLIENT_REGISTRATION_ALLOWED_SCOPES],
		clientPrivileges: async ({ user }) => isAdminOperator(env, user),
		silenceWarnings: {
			oauthAuthServerConfig: true,
		},
		advertisedMetadata: {
			scopes_supported: [...SUPPORTED_OAUTH_SCOPES],
			claims_supported: oauthClaimsSupported(env),
		},
		customIdTokenClaims: ({ user, scopes }) => buildIDTokenScopeClaims(env, user, scopes),
		customUserInfoClaims: async ({ user, scopes }) => {
			const context = needsOAuthClaimContext(scopes)
				? await loadOAuthClaimContext(env, db, user.id)
				: emptyOAuthClaimContext;
			return buildUserInfoScopeClaims(env, user, scopes, context);
		},
		customAccessTokenClaims: async ({ user, scopes }) => {
			if (!user) return {};
			const context = needsOAuthClaimContext(scopes)
				? await loadOAuthClaimContext(env, db, user.id)
				: emptyOAuthClaimContext;
			return buildAccessTokenScopeClaims(env, user, scopes, context);
		},
		scopes: [...SUPPORTED_OAUTH_SCOPES],
		trustedClients: parseOAuthClientSeeds(env.OAUTH_CLIENTS).map((client) => ({
			clientId: client.id,
			clientSecret: client.secret,
			name: client.name,
			redirectURLs: client.redirectUris,
			postLogoutRedirectURLs: client.postLogoutRedirectUris,
			grantTypes: client.grantTypes,
			public: client.public,
			skipConsent: client.skipConsent,
			scopes: supportedClientScopes(client.scopes),
			metadata: JSON.stringify(metadataWithAllowedAudiences(client.allowedAudiences) ?? {}),
		})),
	});
}
