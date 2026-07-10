/**
 * Delegated OAuth authorization for Passport's versioned client API. Inputs
 * are an RS256 bearer token, Passport's local JWKS and OAuth tables, plus the
 * scopes required by a route; output is a live user/client actor. Signature
 * verification is local, while user, client, consent, and trusted-client scope
 * state are re-read for every authorization decision.
 */
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import {
	parseOAuthClientSeeds,
	type AuthEnv,
	type OAuthClientSeed,
} from "../env";
import type { AuthDatabase } from "./auth-server/types";
import {
	clientAPIAuthorizationServerIssuer,
	clientAPIResourceIdentifier,
	insufficientClientAPIScopeError,
	invalidClientAPITokenError,
} from "./client-api-http";

const JWT_KEY_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1_000;

type DelegatedClientAuthEnv = {
	BETTER_AUTH_URL: AuthEnv["BETTER_AUTH_URL"];
	OAUTH_CLIENTS?: string;
};

export type DelegatedClientActor = {
	userId: string;
	clientId: string;
	clientName: string;
	scopes: string[];
};

export type DelegatedAccessTokenClaims = {
	sub: string;
	azp: string;
	iss: string;
	aud: string | string[];
	exp: number;
	scopes: string[];
};

export type DelegatedGrantInput = {
	userId: string;
	clientId: string;
	scopes: readonly string[];
	now?: Date;
};

type LiveClient = {
	clientId: string;
	name: string;
	scopes: string[] | undefined;
	skipConsent: boolean;
	confidential: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decodeBase64URL(value: string) {
	const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
	const binary = atob(padded);
	return new TextDecoder().decode(
		Uint8Array.from(binary, (character) => character.charCodeAt(0)),
	);
}

export function extractClientAPIBearerToken(
	authorization: string | null | undefined,
	passportOrigin: string,
) {
	const match = authorization?.match(/^Bearer[ \t]+([^\s,]+)$/i);
	if (!match?.[1] || match[1].split(".").length !== 3) {
		throw invalidClientAPITokenError(passportOrigin);
	}
	return match[1];
}

export function assertRS256ClientAPIJWT(token: string, passportOrigin: string) {
	try {
		const [encodedHeader] = token.split(".");
		const header = JSON.parse(decodeBase64URL(encodedHeader)) as unknown;
		if (!isRecord(header) || header.alg !== "RS256") {
			throw invalidClientAPITokenError(passportOrigin);
		}
	} catch (error) {
		if (error instanceof Error && error.name === "ClientAPIError") throw error;
		throw invalidClientAPITokenError(passportOrigin);
	}
}

function audienceIncludes(audience: unknown, expected: string) {
	return (
		audience === expected ||
		(Array.isArray(audience) && audience.length === 1 && audience[0] === expected)
	);
}

/**
 * Applies the Passport-specific access-token profile after cryptographic JWT
 * verification. Requiring `sub`, `azp`, and `scope` excludes client-credential
 * and ID tokens from delegated user endpoints.
 */
export function validateDelegatedAccessTokenClaims({
	payload,
	issuer,
	audience,
	requiredScopes = [],
	passportOrigin,
	now = new Date(),
}: {
	payload: unknown;
	issuer: string;
	audience: string;
	requiredScopes?: readonly string[];
	passportOrigin: string;
	now?: Date;
}): DelegatedAccessTokenClaims {
	if (!isRecord(payload)) throw invalidClientAPITokenError(passportOrigin);

	const scope = payload.scope;
	const scopes =
		typeof scope === "string" ? scope.split(" ").map((item) => item.trim()).filter(Boolean) : [];
	const valid =
		typeof payload.sub === "string" &&
		Boolean(payload.sub) &&
		typeof payload.azp === "string" &&
		Boolean(payload.azp) &&
		payload.iss === issuer &&
		audienceIncludes(payload.aud, audience) &&
		typeof payload.exp === "number" &&
		Number.isFinite(payload.exp) &&
		payload.exp > Math.floor(now.getTime() / 1_000) &&
		typeof scope === "string";
	if (!valid) throw invalidClientAPITokenError(passportOrigin);

	const missingScopes = requiredScopes.filter((required) => !scopes.includes(required));
	if (missingScopes.length) {
		throw insufficientClientAPIScopeError(passportOrigin, requiredScopes);
	}

	return {
		sub: payload.sub as string,
		azp: payload.azp as string,
		iss: payload.iss as string,
		aud: payload.aud as string | string[],
		exp: payload.exp as number,
		scopes,
	};
}

function configuredTrustedClient(
	clients: readonly OAuthClientSeed[],
	clientId: string,
): LiveClient | undefined {
	const client = clients.find((candidate) => candidate.id === clientId);
	if (!client) return undefined;
	return {
		clientId: client.id,
		name: client.name,
		scopes: client.scopes,
		skipConsent: client.skipConsent === true,
		confidential: client.public !== true && Boolean(client.secret),
	};
}

function scopesInclude(granted: readonly string[] | undefined, requested: readonly string[]) {
	if (!granted) return false;
	const grant = new Set(granted);
	return requested.every((scope) => grant.has(scope));
}

function userIsBanned(
	user: { banned: boolean | null; banExpires: Date | null },
	now: Date,
) {
	return (
		user.banned === true &&
		(!user.banExpires || user.banExpires.getTime() > now.getTime())
	);
}

/**
 * Rechecks a delegated grant without relying on token freshness. Hosted
 * billing handoffs call this immediately before execution so client disable,
 * consent revocation, trusted-client scope changes, and user bans take effect.
 */
export async function authorizeDelegatedGrant(
	env: DelegatedClientAuthEnv,
	db: AuthDatabase,
	input: DelegatedGrantInput,
): Promise<DelegatedClientActor> {
	const now = input.now ?? new Date();
	const [users, databaseClients] = await Promise.all([
		db
			.select({
				id: schema.user.id,
				banned: schema.user.banned,
				banExpires: schema.user.banExpires,
			})
			.from(schema.user)
			.where(eq(schema.user.id, input.userId))
			.limit(1),
		db
			.select({
				clientId: schema.oauthClient.clientId,
				clientSecret: schema.oauthClient.clientSecret,
				disabled: schema.oauthClient.disabled,
				name: schema.oauthClient.name,
				public: schema.oauthClient.public,
				scopes: schema.oauthClient.scopes,
				skipConsent: schema.oauthClient.skipConsent,
				tokenEndpointAuthMethod: schema.oauthClient.tokenEndpointAuthMethod,
			})
			.from(schema.oauthClient)
			.where(eq(schema.oauthClient.clientId, input.clientId))
			.limit(1),
	]);

	const currentUser = users[0];
	if (!currentUser || userIsBanned(currentUser, now)) {
		throw invalidClientAPITokenError(env.BETTER_AUTH_URL);
	}

	const databaseClient = databaseClients[0];
	if (databaseClient?.disabled) {
		throw invalidClientAPITokenError(env.BETTER_AUTH_URL);
	}

	const client: LiveClient | undefined = databaseClient
		? {
				clientId: databaseClient.clientId,
				name: databaseClient.name ?? databaseClient.clientId,
				scopes: databaseClient.scopes ?? undefined,
				skipConsent: databaseClient.skipConsent === true,
				confidential:
					databaseClient.public !== true &&
					databaseClient.tokenEndpointAuthMethod !== "none" &&
					Boolean(databaseClient.clientSecret),
			}
		: configuredTrustedClient(parseOAuthClientSeeds(env.OAUTH_CLIENTS), input.clientId);
	if (!client?.confidential) {
		throw invalidClientAPITokenError(env.BETTER_AUTH_URL);
	}

	if (client.scopes && !scopesInclude(client.scopes, input.scopes)) {
		throw invalidClientAPITokenError(env.BETTER_AUTH_URL);
	}

	if (client.skipConsent) {
		if (!scopesInclude(client.scopes, input.scopes)) {
			throw invalidClientAPITokenError(env.BETTER_AUTH_URL);
		}
	} else {
		const [consent] = await db
			.select({ scopes: schema.oauthConsent.scopes })
			.from(schema.oauthConsent)
			.where(
				and(
					eq(schema.oauthConsent.userId, input.userId),
					eq(schema.oauthConsent.clientId, input.clientId),
				),
			)
			.limit(1);
		if (!consent || !scopesInclude(consent.scopes, input.scopes)) {
			throw invalidClientAPITokenError(env.BETTER_AUTH_URL);
		}
	}

	return {
		userId: input.userId,
		clientId: client.clientId,
		clientName: client.name,
		scopes: [...input.scopes],
	};
}

async function localJWKS(db: AuthDatabase, now: Date) {
	const rows = await db
		.select({
			id: schema.jwks.id,
			publicKey: schema.jwks.publicKey,
			expiresAt: schema.jwks.expiresAt,
		})
		.from(schema.jwks);
	return {
		keys: rows
			.filter(
				(row) =>
					!row.expiresAt ||
					row.expiresAt.getTime() + JWT_KEY_GRACE_PERIOD_MS > now.getTime(),
			)
			.map((row) => {
				const publicKey = JSON.parse(row.publicKey) as unknown;
				if (!isRecord(publicKey)) throw new TypeError("Stored JWKS public key is invalid.");
				return {
					...publicKey,
					alg: "RS256",
					kid: row.id,
					use: "sig",
				};
			}),
	};
}

export async function authorizeDelegatedClientRequest(
	env: DelegatedClientAuthEnv,
	db: AuthDatabase,
	{
		authorization,
		requiredScopes = [],
		now = new Date(),
	}: {
		authorization: string | null | undefined;
		requiredScopes?: readonly string[];
		now?: Date;
	},
): Promise<DelegatedClientActor> {
	const token = extractClientAPIBearerToken(authorization, env.BETTER_AUTH_URL);
	assertRS256ClientAPIJWT(token, env.BETTER_AUTH_URL);
	const issuer = clientAPIAuthorizationServerIssuer(env.BETTER_AUTH_URL);
	const audience = clientAPIResourceIdentifier(env.BETTER_AUTH_URL);
	const jwks = await localJWKS(db, now);

	let payload: unknown;
	try {
		payload = await verifyJwsAccessToken(token, {
			jwksFetch: async () => jwks,
			verifyOptions: {
				algorithms: ["RS256"],
				audience,
				issuer,
			},
		});
	} catch {
		throw invalidClientAPITokenError(env.BETTER_AUTH_URL);
	}

	const claims = validateDelegatedAccessTokenClaims({
		payload,
		issuer,
		audience,
		requiredScopes,
		passportOrigin: env.BETTER_AUTH_URL,
		now,
	});
	return authorizeDelegatedGrant(env, db, {
		userId: claims.sub,
		clientId: claims.azp,
		scopes: claims.scopes,
		now,
	});
}
