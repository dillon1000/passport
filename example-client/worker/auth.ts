/**
 * Better Auth configuration for the example OAuth client. Inputs are Wrangler
 * auth variables and Passport discovery metadata; outputs are Better Auth
 * routes, a stateless session cookie, and a session DTO that exposes verified
 * Passport claim groups without returning raw tokens. Safe configuration
 * points: `AUTH_ISSUER`, `BETTER_AUTH_URL`, `CLIENT_ID`, `CLIENT_SECRET`,
 * `REDIRECT_URI`, and `BETTER_AUTH_SECRET`.
 */
import { getAccountCookie } from "better-auth/cookies";
import { betterAuth } from "better-auth/minimal";
import { customSession } from "better-auth/plugins/custom-session";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { decodeJwt } from "jose";

export type ClientEnv = Env & {
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	CLIENT_SECRET: string;
	REDIRECT_URI?: string;
};

export type OAuthClaimGroup = Record<string, unknown>;

export type PassportConnectionClaim = {
	provider: string;
	accountId: string;
	scopes?: string[];
	connectedAt?: string;
	updatedAt?: string;
};

export type PassportClaimHighlights = {
	preferredUsername?: string;
	phoneNumber?: string;
	phoneNumberVerified?: boolean;
	organizationIds: string[];
	organizationRoles: Record<string, string>;
	teamIds: string[];
	roles: string[];
	permissions: string[];
	entitlements: string[];
	mfaEnabled?: boolean;
	passkeyEnabled?: boolean;
	connections: PassportConnectionClaim[];
};

export type ExampleSessionPayload =
	| {
			authenticated: false;
	  }
	| {
			authenticated: true;
			user: {
				id: string;
				email: string;
				emailVerified: boolean;
				name: string;
				image?: string | null;
			};
			session: {
				id: string;
				expiresAt: Date;
			};
			scopes: string[];
			claims: {
				idToken?: OAuthClaimGroup;
				accessToken?: OAuthClaimGroup;
				userInfo?: OAuthClaimGroup;
			};
			passportClaims: PassportClaimHighlights;
			claimNames: ReturnType<typeof passportClaimNames>;
	  };

const PASSPORT_PROVIDER_ID = "passport";
export const PASSPORT_EXAMPLE_SCOPES = [
	"openid",
	"offline_access",
	"profile",
	"email",
	"phone",
	"profile:picture",
	"profile:username",
	"organizations",
	"organizations:ids",
	"organizations:roles",
	"teams",
	"teams:ids",
	"permissions",
	"account:security",
	"connections",
	"profile:write",
	"organizations:write",
	"teams:write",
	"billing:subscriptions",
	"billing:purchases",
	"billing:checkout",
] as const;

type DiscoveryMetadata = {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	userinfo_endpoint?: string;
	jwks_uri?: string;
};

function withoutTrailingSlash(value: string) {
	return value.replace(/\/+$/, "");
}

function absoluteURL(baseURL: string, path: string) {
	return new URL(path, `${withoutTrailingSlash(baseURL)}/`).toString();
}

/**
 * Returns the delegated Passport API resource identifier. `AUTH_ISSUER` may
 * point at an issuer path, so the leading slash deliberately resolves from the
 * deployment origin.
 */
export function passportResourceURL(env: Pick<ClientEnv, "AUTH_ISSUER">) {
	return absoluteURL(env.AUTH_ISSUER, "/api/v1");
}

export function passportClaimURL(env: Pick<ClientEnv, "AUTH_ISSUER">, name: string) {
	return absoluteURL(env.AUTH_ISSUER, `/claims/${name}`);
}

export function passportClaimNames(env: Pick<ClientEnv, "AUTH_ISSUER">) {
	return {
		organizations: passportClaimURL(env, "organizations"),
		teams: passportClaimURL(env, "teams"),
		organizationIds: passportClaimURL(env, "organization_ids"),
		organizationRoles: passportClaimURL(env, "organization_roles"),
		teamIds: passportClaimURL(env, "team_ids"),
		roles: passportClaimURL(env, "roles"),
		permissions: passportClaimURL(env, "permissions"),
		entitlements: passportClaimURL(env, "entitlements"),
		mfaEnabled: passportClaimURL(env, "mfa_enabled"),
		passkeyEnabled: passportClaimURL(env, "passkey_enabled"),
		connections: passportClaimURL(env, "connections"),
	};
}

function discoveryURL(env: Pick<ClientEnv, "AUTH_ISSUER">) {
	return absoluteURL(env.AUTH_ISSUER, "/api/auth/.well-known/openid-configuration");
}

export function betterAuthCallbackURL(env: Pick<ClientEnv, "BETTER_AUTH_URL">) {
	return absoluteURL(env.BETTER_AUTH_URL, `/api/auth/oauth2/callback/${PASSPORT_PROVIDER_ID}`);
}

function redirectURI(env: Pick<ClientEnv, "BETTER_AUTH_URL" | "REDIRECT_URI">) {
	return env.REDIRECT_URI || betterAuthCallbackURL(env);
}

async function loadDiscovery(env: Pick<ClientEnv, "AUTH_ISSUER">) {
	const response = await fetch(discoveryURL(env));
	if (!response.ok) {
		throw new Error(`Passport discovery failed with ${response.status}.`);
	}
	return (await response.json()) as DiscoveryMetadata;
}

function decodeTokenClaims(token: string | null | undefined) {
	if (!token) return undefined;
	try {
		return decodeJwt(token) as OAuthClaimGroup;
	} catch {
		return undefined;
	}
}

function splitScopes(scope: string | null | undefined) {
	return (
		scope
			?.split(/[,\s]+/)
			.map((item) => item.trim())
			.filter(Boolean) ?? []
	);
}

function stringClaim(value: unknown) {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanClaim(value: unknown) {
	return typeof value === "boolean" ? value : undefined;
}

function stringArrayClaim(value: unknown) {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
		: [];
}

function stringRecordClaim(value: unknown) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};

	return Object.fromEntries(
		Object.entries(value).filter(
			(entry): entry is [string, string] =>
				typeof entry[0] === "string" &&
				entry[0].trim().length > 0 &&
				typeof entry[1] === "string",
		),
	);
}

function connectionClaims(value: unknown): PassportConnectionClaim[] {
	if (!Array.isArray(value)) return [];

	return value.flatMap((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) return [];

		const record = item as Record<string, unknown>;
		const provider = stringClaim(record.provider);
		const accountId = stringClaim(record.accountId);
		if (!provider || !accountId) return [];

		const scopes = stringArrayClaim(record.scopes);
		const connectedAt = stringClaim(record.connectedAt);
		const updatedAt = stringClaim(record.updatedAt);

		return [
			{
				provider,
				accountId,
				...(scopes.length ? { scopes } : {}),
				...(connectedAt ? { connectedAt } : {}),
				...(updatedAt ? { updatedAt } : {}),
			},
		];
	});
}

type PassportClaimGroups = {
	idToken?: OAuthClaimGroup;
	accessToken?: OAuthClaimGroup;
	userInfo?: OAuthClaimGroup;
};

function firstClaim(claims: readonly (OAuthClaimGroup | undefined)[], name: string) {
	for (const claimGroup of claims) {
		if (claimGroup && name in claimGroup) return claimGroup[name];
	}
	return undefined;
}

export function extractPassportClaimHighlights(
	env: Pick<ClientEnv, "AUTH_ISSUER">,
	claims: PassportClaimGroups,
): PassportClaimHighlights {
	const names = passportClaimNames(env);
	const idAndUserInfoClaims = [claims.idToken, claims.userInfo];
	const userAndAccessClaims = [claims.userInfo, claims.accessToken];

	return {
		preferredUsername: stringClaim(firstClaim(idAndUserInfoClaims, "preferred_username")),
		phoneNumber: stringClaim(firstClaim(idAndUserInfoClaims, "phone_number")),
		phoneNumberVerified: booleanClaim(
			firstClaim(idAndUserInfoClaims, "phone_number_verified"),
		),
		organizationIds: stringArrayClaim(
			firstClaim(userAndAccessClaims, names.organizationIds),
		),
		organizationRoles: stringRecordClaim(
			firstClaim(userAndAccessClaims, names.organizationRoles),
		),
		teamIds: stringArrayClaim(firstClaim(userAndAccessClaims, names.teamIds)),
		roles: stringArrayClaim(firstClaim(userAndAccessClaims, names.roles)),
		permissions: stringArrayClaim(firstClaim(userAndAccessClaims, names.permissions)),
		entitlements: stringArrayClaim(firstClaim(userAndAccessClaims, names.entitlements)),
		mfaEnabled: booleanClaim(firstClaim(userAndAccessClaims, names.mfaEnabled)),
		passkeyEnabled: booleanClaim(firstClaim(userAndAccessClaims, names.passkeyEnabled)),
		connections: connectionClaims(firstClaim([claims.userInfo], names.connections)),
	};
}

async function loadUserInfoClaims(
	env: Pick<ClientEnv, "AUTH_ISSUER">,
	accessToken: string | null | undefined,
) {
	if (!accessToken) return undefined;
	const metadata = await loadDiscovery(env);
	if (!metadata.userinfo_endpoint) return undefined;

	const response = await fetch(metadata.userinfo_endpoint, {
		headers: {
			authorization: `Bearer ${accessToken}`,
		},
	});
	if (!response.ok) return undefined;
	return (await response.json()) as OAuthClaimGroup;
}

export function createExampleAuth(env: ClientEnv) {
	return betterAuth({
		appName: "Passport Example Client",
		basePath: "/api/auth",
		baseURL: env.BETTER_AUTH_URL,
		secret: env.BETTER_AUTH_SECRET,
		trustedOrigins: [env.BETTER_AUTH_URL, env.AUTH_ISSUER],
		advanced: {
			cookiePrefix: "passport-example",
		},
		account: {
			storeAccountCookie: true,
			storeStateStrategy: "cookie",
		},
		session: {
			expiresIn: 60 * 60 * 24 * 7,
			cookieCache: {
				enabled: true,
				maxAge: 60 * 60 * 24 * 7,
				refreshCache: true,
				strategy: "jwe",
			},
		},
		plugins: [
			genericOAuth({
				config: [
					{
						providerId: PASSPORT_PROVIDER_ID,
						discoveryUrl: discoveryURL(env),
						clientId: env.CLIENT_ID,
						clientSecret: env.CLIENT_SECRET,
						redirectURI: redirectURI(env),
						pkce: true,
						scopes: [...PASSPORT_EXAMPLE_SCOPES],
						authorizationUrlParams: {
							resource: passportResourceURL(env),
						},
						tokenUrlParams: {
							resource: passportResourceURL(env),
						},
					},
				],
			}),
			customSession(async ({ user, session }, ctx) => {
				const account = await getAccountCookie(ctx);
				const userInfo = await loadUserInfoClaims(env, account?.accessToken);
				const claims = {
					idToken: decodeTokenClaims(account?.idToken),
					accessToken: decodeTokenClaims(account?.accessToken),
					userInfo,
				};

				return {
					user,
					session,
					scopes: splitScopes(account?.scope),
					claims,
					passportClaims: extractPassportClaimHighlights(env, claims),
					claimNames: passportClaimNames(env),
				};
			}),
		],
	});
}

export async function getExampleSessionPayload(
	request: Request,
	env: ClientEnv,
): Promise<ExampleSessionPayload> {
	const session = await createExampleAuth(env).api.getSession({
		headers: request.headers,
	});
	if (!session) return { authenticated: false };

	return {
		authenticated: true,
		user: {
			id: session.user.id,
			email: session.user.email,
			emailVerified: session.user.emailVerified,
			name: session.user.name,
			image: session.user.image,
		},
		session: {
			id: session.session.id,
			expiresAt: session.session.expiresAt,
		},
		scopes: session.scopes,
		claims: session.claims,
		passportClaims: session.passportClaims,
		claimNames: session.claimNames,
	};
}

export async function startPassportLogin(request: Request, env: ClientEnv) {
	const result = await createExampleAuth(env).api.signInWithOAuth2({
		headers: request.headers,
		returnHeaders: true,
		body: {
			providerId: PASSPORT_PROVIDER_ID,
			callbackURL: "/?login=complete",
			errorCallbackURL: "/?error=auth_failed",
		},
	});

	return result;
}

export async function signOut(request: Request, env: ClientEnv) {
	return createExampleAuth(env).api.signOut({
		headers: request.headers,
		returnHeaders: true,
	});
}
