/**
 * OAuth provider plugin construction. Inputs are runtime env, trusted-client
 * seed JSON, supported scope definitions, and user claim context from the
 * database; output is the configured Better Auth OAuth provider plugin.
 */
import { oauthProvider } from "@better-auth/oauth-provider";

import type { AuthEnv } from "../../env";
import { parseOAuthClientSeeds } from "../../env";
import { isAdminOperator } from "../admin-access";
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
		].includes(scope),
	);
}

export function oauthProviderPlugin(env: AuthEnv, db: AuthDatabase) {
	return oauthProvider({
		loginPage: "/sign-in",
		consentPage: "/consent",
		disabledPaths: ["/token"],
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
				? await loadOAuthClaimContext(db, user.id)
				: emptyOAuthClaimContext;
			return buildUserInfoScopeClaims(env, user, scopes, context);
		},
		customAccessTokenClaims: async ({ user, scopes }) => {
			if (!user) return {};
			const context = needsOAuthClaimContext(scopes)
				? await loadOAuthClaimContext(db, user.id)
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
			public: client.public,
			skipConsent: client.skipConsent,
			scopes: supportedClientScopes(client.scopes),
		})),
	});
}
