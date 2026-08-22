/**
 * Delegated OAuth authorization for Passport's versioned client API. Inputs
 * are an RS256 bearer token, Passport's local JWKS and OAuth tables, plus the
 * scopes required by a route; output is a live user/client actor. Signature
 * verification is local, while user, client, consent, and trusted-client scope
 * state are re-read for every authorization decision.
 */
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

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

type DelegatedGrantUser = { banned: boolean | null; banExpires: Date | null };
type DelegatedGrantClient = {
	clientId: string;
	clientSecret: string | null;
	disabled: boolean | null;
	name: string | null;
	public: boolean | null;
	scopes: string[] | null;
	skipConsent: boolean | null;
	tokenEndpointAuthMethod: string | null;
};
export type DelegatedGrantDatabase = {
	findUser: (userId: string) => Promise<DelegatedGrantUser | undefined>;
	findClient: (clientId: string) => Promise<DelegatedGrantClient | undefined>;
	findConsent: (input: { userId: string; clientId: string }) => Promise<{ scopes: string[] | null } | undefined>;
};

function isDelegatedGrantDatabase(db: AuthDatabase | DelegatedGrantDatabase): db is DelegatedGrantDatabase {
	return "findUser" in db;
}

const rs256HeaderSchema = z.object({ alg: z.literal("RS256") }).passthrough();
const verifiedAccessTokenSchema = z.object({
	sub: z.string().min(1),
	azp: z.string().min(1),
	iss: z.string(),
	aud: z.union([z.string(), z.array(z.string())]),
	exp: z.number().finite(),
	scope: z.string(),
});
const publicJWKSchema = z.object({
	kty: z.string().min(1),
	use: z.string().optional(),
	kid: z.string().optional(),
	alg: z.string().optional(),
	n: z.string().optional(),
	e: z.string().optional(),
	crv: z.string().optional(),
	x: z.string().optional(),
	y: z.string().optional(),
});

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
		const header = rs256HeaderSchema.safeParse(JSON.parse(decodeBase64URL(encodedHeader)));
		if (!header.success) {
			throw invalidClientAPITokenError(passportOrigin);
		}
	} catch (error) {
		if (error instanceof Error && error.name === "ClientAPIError") throw error;
		throw invalidClientAPITokenError(passportOrigin);
	}
}

function audienceIncludes(audience: string | string[], expected: string) {
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
	const parsed = verifiedAccessTokenSchema.safeParse(payload);
	if (!parsed.success) throw invalidClientAPITokenError(passportOrigin);
	const scopes = parsed.data.scope.split(" ").map((item) => item.trim()).filter(Boolean);
	const valid =
		parsed.data.iss === issuer &&
		audienceIncludes(parsed.data.aud, audience) &&
		parsed.data.exp > Math.floor(now.getTime() / 1_000);
	if (!valid) throw invalidClientAPITokenError(passportOrigin);

	const missingScopes = requiredScopes.filter((required) => !scopes.includes(required));
	if (missingScopes.length) {
		throw insufficientClientAPIScopeError(passportOrigin, requiredScopes);
	}

	return {
		sub: parsed.data.sub,
		azp: parsed.data.azp,
		iss: parsed.data.iss,
		aud: parsed.data.aud,
		exp: parsed.data.exp,
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
	user: DelegatedGrantUser,
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
	db: AuthDatabase | DelegatedGrantDatabase,
	input: DelegatedGrantInput,
): Promise<DelegatedClientActor> {
	const now = input.now ?? new Date();
	let currentUser: DelegatedGrantUser | undefined;
	let databaseClient: DelegatedGrantClient | undefined;
	if (isDelegatedGrantDatabase(db)) {
		[currentUser, databaseClient] = await Promise.all([
			db.findUser(input.userId),
			db.findClient(input.clientId),
		]);
	} else {
		const [users, clients] = await Promise.all([
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
		currentUser = users[0];
		databaseClient = clients[0];
	}
	if (!currentUser || userIsBanned(currentUser, now)) {
		throw invalidClientAPITokenError(env.BETTER_AUTH_URL);
	}

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
		const consent = isDelegatedGrantDatabase(db)
			? await db.findConsent({ userId: input.userId, clientId: input.clientId })
			: (
				await db
					.select({ scopes: schema.oauthConsent.scopes })
					.from(schema.oauthConsent)
					.where(
						and(
							eq(schema.oauthConsent.userId, input.userId),
							eq(schema.oauthConsent.clientId, input.clientId),
						),
					)
					.limit(1)
			)[0];
		if (!consent || !scopesInclude(consent.scopes ?? undefined, input.scopes)) {
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
				const publicKey = publicJWKSchema.safeParse(JSON.parse(row.publicKey));
				if (!publicKey.success) throw new TypeError("Stored JWKS public key is invalid.");
				return {
					...publicKey.data,
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
