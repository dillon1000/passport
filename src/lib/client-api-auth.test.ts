import { describe, expect, it, vi } from "vitest";

import type { AuthDatabase } from "./auth-server/types";
import {
	assertRS256ClientAPIJWT,
	authorizeDelegatedGrant,
	extractClientAPIBearerToken,
	validateDelegatedAccessTokenClaims,
} from "./client-api-auth";
import { ClientAPIError } from "./client-api-http";

const passportOrigin = "https://passport.test";
const issuer = `${passportOrigin}/api/auth`;
const audience = `${passportOrigin}/api/v1`;
const futureExpiration = Math.floor(Date.now() / 1_000) + 600;

function encodedJSON(value: unknown) {
	return btoa(JSON.stringify(value))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

function tokenWithAlgorithm(algorithm: string) {
	return `${encodedJSON({ alg: algorithm, kid: "key_1" })}.${encodedJSON({})}.signature`;
}

function delegatedPayload(overrides: Record<string, unknown> = {}) {
	return {
		sub: "user_1",
		azp: "client_1",
		iss: issuer,
		aud: audience,
		exp: futureExpiration,
		scope: "openid teams teams:write",
		...overrides,
	};
}

function expectClientAPIError(action: () => unknown, code: string) {
	try {
		action();
		throw new Error("Expected a ClientAPIError.");
	} catch (error) {
		expect(error).toBeInstanceOf(ClientAPIError);
		expect((error as ClientAPIError).code).toBe(code);
	}
}

type MockSelectChain = {
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
};

function databaseWithSelectResults(...results: unknown[][]) {
	const select = vi.fn();
	for (const rows of results) {
		select.mockImplementationOnce(() => {
			const chain = {} as MockSelectChain;
			chain.from = vi.fn(() => chain);
			chain.where = vi.fn(() => chain);
			chain.limit = vi.fn(async () => rows);
			return chain;
		});
	}
	return { select } as unknown as AuthDatabase;
}

function currentDatabaseClient(overrides: Record<string, unknown> = {}) {
	return {
		clientId: "client_1",
		clientSecret: "encrypted-secret",
		disabled: false,
		name: "Acme",
		public: false,
		scopes: ["teams:write"],
		skipConsent: false,
		tokenEndpointAuthMethod: "client_secret_basic",
		...overrides,
	};
}

describe("delegated client API authorization", () => {
	it("accepts one well-formed Bearer JWT and requires RS256", () => {
		const token = tokenWithAlgorithm("RS256");

		expect(extractClientAPIBearerToken(`Bearer ${token}`, passportOrigin)).toBe(token);
		expect(() => assertRS256ClientAPIJWT(token, passportOrigin)).not.toThrow();
		expectClientAPIError(
			() => assertRS256ClientAPIJWT(tokenWithAlgorithm("HS256"), passportOrigin),
			"invalid_token",
		);
	});

	it("rejects missing, opaque, and malformed bearer credentials", () => {
		for (const authorization of [undefined, "Basic abc", "Bearer opaque", "Bearer a.b.c,d"]) {
			expectClientAPIError(
				() => extractClientAPIBearerToken(authorization, passportOrigin),
				"invalid_token",
			);
		}
	});

	it("validates delegated access-token claims and exact authority", () => {
		expect(
			validateDelegatedAccessTokenClaims({
				payload: delegatedPayload({ aud: audience }),
				issuer,
				audience,
				requiredScopes: ["teams:write"],
				passportOrigin,
			}),
		).toMatchObject({
			sub: "user_1",
			azp: "client_1",
			scopes: ["openid", "teams", "teams:write"],
		});
	});

	it("rejects wrong issuer, wrong resource, expired, ID, and M2M token claims", () => {
		const invalidPayloads = [
			delegatedPayload({ iss: "https://other.test/api/auth" }),
			delegatedPayload({ aud: "https://other.test/api/v1" }),
			delegatedPayload({ aud: [audience, `${issuer}/oauth2/userinfo`] }),
			delegatedPayload({ exp: 1 }),
			{ sub: "user_1", iss: issuer, aud: "client_1", exp: futureExpiration },
			delegatedPayload({ sub: undefined }),
		];

		for (const payload of invalidPayloads) {
			expectClientAPIError(
				() =>
					validateDelegatedAccessTokenClaims({
						payload,
						issuer,
						audience,
						passportOrigin,
					}),
				"invalid_token",
			);
		}
	});

	it("uses RFC 6750 insufficient_scope for a missing route scope", () => {
		expectClientAPIError(
			() =>
				validateDelegatedAccessTokenClaims({
					payload: delegatedPayload(),
					issuer,
					audience,
					requiredScopes: ["billing:checkout"],
					passportOrigin,
				}),
			"insufficient_scope",
		);
	});

	it("reauthorizes a confidential trusted client against current configured scopes", async () => {
		const db = databaseWithSelectResults(
			[{ id: "user_1", banned: false, banExpires: null }],
			[],
		);
		const env = {
			BETTER_AUTH_URL: passportOrigin,
			OAUTH_CLIENTS: JSON.stringify([
				{
					id: "client_1",
					secret: "secret",
					name: "Acme",
					redirectUris: ["https://acme.test/callback"],
					scopes: ["teams:write"],
					skipConsent: true,
				},
			]),
		};

		await expect(
			authorizeDelegatedGrant(env, db, {
				userId: "user_1",
				clientId: "client_1",
				scopes: ["teams:write"],
			}),
		).resolves.toEqual({
			userId: "user_1",
			clientId: "client_1",
			clientName: "Acme",
			scopes: ["teams:write"],
		});
	});

	it("rejects revoked consent and currently banned users", async () => {
		const currentClient = currentDatabaseClient();
		const revokedConsentDB = databaseWithSelectResults(
			[{ id: "user_1", banned: false, banExpires: null }],
			[currentClient],
			[],
		);
		await expect(
			authorizeDelegatedGrant(
				{ BETTER_AUTH_URL: passportOrigin },
				revokedConsentDB,
				{ userId: "user_1", clientId: "client_1", scopes: ["teams:write"] },
			),
		).rejects.toMatchObject({ code: "invalid_token", status: 401 });

		const bannedUserDB = databaseWithSelectResults(
			[{ id: "user_1", banned: true, banExpires: null }],
			[currentClient],
		);
		await expect(
			authorizeDelegatedGrant(
				{ BETTER_AUTH_URL: passportOrigin },
				bannedUserDB,
				{ userId: "user_1", clientId: "client_1", scopes: ["teams:write"] },
			),
		).rejects.toMatchObject({ code: "invalid_token", status: 401 });
	});

	it("accepts a current consent grant for a confidential database client", async () => {
		const db = databaseWithSelectResults(
			[{ id: "user_1", banned: false, banExpires: null }],
			[currentDatabaseClient()],
			[{ scopes: ["teams:write"] }],
		);

		await expect(
			authorizeDelegatedGrant(
				{ BETTER_AUTH_URL: passportOrigin },
				db,
				{ userId: "user_1", clientId: "client_1", scopes: ["teams:write"] },
			),
		).resolves.toMatchObject({
			userId: "user_1",
			clientId: "client_1",
			clientName: "Acme",
		});
	});

	it.each([
		["disabled", { disabled: true }],
		["public", { public: true, clientSecret: null, tokenEndpointAuthMethod: "none" }],
	])("rejects a %s OAuth client", async (_label, overrides) => {
		const db = databaseWithSelectResults(
			[{ id: "user_1", banned: false, banExpires: null }],
			[currentDatabaseClient(overrides)],
		);

		await expect(
			authorizeDelegatedGrant(
				{ BETTER_AUTH_URL: passportOrigin },
				db,
				{ userId: "user_1", clientId: "client_1", scopes: ["teams:write"] },
			),
		).rejects.toMatchObject({ code: "invalid_token", status: 401 });
	});
});
