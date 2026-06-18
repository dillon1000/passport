import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	PASSPORT_EXAMPLE_SCOPES,
	extractPassportClaimHighlights,
	passportClaimNames,
} from "./auth";
import app from "./index";

type TestEnv = Env & {
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	CLIENT_SECRET: string;
};

const env = {
	ASSETS: {
		fetch: () => new Response("not found", { status: 404 }),
	},
	AUTH_ISSUER: "https://passport.test",
	BETTER_AUTH_SECRET: "test-secret-with-enough-entropy-for-better-auth",
	BETTER_AUTH_URL: "https://client.test",
	CLIENT_ID: "example-client",
	CLIENT_SECRET: "example-client-secret",
	POST_LOGOUT_REDIRECT_URI: "https://client.test/",
	REDIRECT_URI: "https://client.test/callback",
} as TestEnv;

const discovery = {
	issuer: "https://passport.test",
	authorization_endpoint: "https://passport.test/oauth2/authorize",
	token_endpoint: "https://passport.test/oauth2/token",
	userinfo_endpoint: "https://passport.test/oauth2/userinfo",
	jwks_uri: "https://passport.test/api/auth/jwks",
};

describe("example-client auth worker", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = new URL(input instanceof Request ? input.url : String(input));
				if (
					url.hostname === "passport.test" &&
					url.pathname === "/api/auth/.well-known/openid-configuration"
				) {
					return Response.json(discovery);
				}
				return new Response("not found", { status: 404 });
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("mounts Better Auth under /api/auth", async () => {
		const response = await app.fetch(new Request("https://client.test/api/auth/ok"), env);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
	});

	it("starts Passport OAuth through Better Auth with Passport claim scopes", async () => {
		const response = await app.fetch(new Request("https://client.test/api/login"), env);

		expect(response.status).toBe(302);
		const location = response.headers.get("location");
		expect(location).toBeTruthy();

		const authorizationURL = new URL(location ?? "");
		const scopes = (authorizationURL.searchParams.get("scope") ?? "").split(" ");

		expect(`${authorizationURL.origin}${authorizationURL.pathname}`).toBe(
			discovery.authorization_endpoint,
		);
		expect(authorizationURL.searchParams.get("client_id")).toBe("example-client");
		expect(authorizationURL.searchParams.get("redirect_uri")).toBe("https://client.test/callback");
		expect(authorizationURL.searchParams.get("code_challenge_method")).toBe("S256");
		expect(scopes).toEqual([
			"openid",
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
		]);
		expect(response.headers.get("set-cookie")).toContain("passport-example.oauth_state=");
		expect(response.headers.get("set-cookie")).not.toContain("better-auth.oauth_state=");
	});

	it("keeps the example scope list aligned with the requested Passport claims", () => {
		expect(PASSPORT_EXAMPLE_SCOPES).toEqual([
			"openid",
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
		]);
	});

	it("names every Passport claim the example client consumes", () => {
		expect(passportClaimNames(env)).toEqual({
			organizations: "https://passport.test/claims/organizations",
			teams: "https://passport.test/claims/teams",
			organizationIds: "https://passport.test/claims/organization_ids",
			organizationRoles: "https://passport.test/claims/organization_roles",
			teamIds: "https://passport.test/claims/team_ids",
			roles: "https://passport.test/claims/roles",
			permissions: "https://passport.test/claims/permissions",
			entitlements: "https://passport.test/claims/entitlements",
			mfaEnabled: "https://passport.test/claims/mfa_enabled",
			passkeyEnabled: "https://passport.test/claims/passkey_enabled",
			connections: "https://passport.test/claims/connections",
		});
	});

	it("normalizes Passport claims for the UI without exposing provider tokens", () => {
		const names = passportClaimNames(env);

		expect(
			extractPassportClaimHighlights(env, {
				idToken: {
					preferred_username: "Dillon",
					phone_number: "+15555550123",
					phone_number_verified: true,
				},
				userInfo: {
					[names.organizationIds]: ["org_123"],
					[names.organizationRoles]: {
						org_123: "owner",
					},
					[names.teamIds]: ["team_123"],
					[names.connections]: [
						{
							provider: "github",
							accountId: "dillon1000",
							scopes: ["read:user"],
							connectedAt: "2026-01-02T03:04:05.000Z",
							accessToken: "secret-token",
						},
					],
				},
				accessToken: {
					[names.roles]: ["authenticated"],
					[names.permissions]: [],
					[names.entitlements]: [],
					[names.mfaEnabled]: true,
					[names.passkeyEnabled]: false,
				},
			}),
		).toEqual({
			preferredUsername: "Dillon",
			phoneNumber: "+15555550123",
			phoneNumberVerified: true,
			organizationIds: ["org_123"],
			organizationRoles: {
				org_123: "owner",
			},
			teamIds: ["team_123"],
			roles: ["authenticated"],
			permissions: [],
			entitlements: [],
			mfaEnabled: true,
			passkeyEnabled: false,
			connections: [
				{
					provider: "github",
					accountId: "dillon1000",
					scopes: ["read:user"],
					connectedAt: "2026-01-02T03:04:05.000Z",
				},
			],
		});
	});
});
