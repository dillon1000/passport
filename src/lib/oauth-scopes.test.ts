import { describe, expect, it } from "vitest";

import {
	CLIENT_REGISTRATION_ALLOWED_SCOPES,
	DEFAULT_CLIENT_REGISTRATION_SCOPES,
	SUPPORTED_OAUTH_SCOPES,
	assertSupportedOAuthScopes,
	defaultClientScopeString,
	supportedScopeString,
	unsupportedOAuthScopes,
} from "./oauth-scopes";

describe("OAuth scope registry", () => {
	it("defines the standard and Passport-specific scopes apps can request", () => {
		expect(SUPPORTED_OAUTH_SCOPES).toEqual([
			"openid",
			"profile",
			"email",
			"phone",
			"offline_access",
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
		expect(SUPPORTED_OAUTH_SCOPES).not.toContain("relationships");
	});

	it("keeps dynamic client registration defaults narrow", () => {
		expect(DEFAULT_CLIENT_REGISTRATION_SCOPES).toEqual(["openid", "profile", "email"]);
		expect(defaultClientScopeString()).toBe("openid profile email");
	});

	it("allows optional custom scopes during dynamic client registration", () => {
		expect(CLIENT_REGISTRATION_ALLOWED_SCOPES).toEqual([
			"phone",
			"offline_access",
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
		expect(supportedScopeString()).toBe(
			"openid profile email phone offline_access profile:picture profile:username organizations organizations:ids organizations:roles teams teams:ids permissions account:security connections",
		);
	});

	it("reports unsupported scope names without hiding the valid ones", () => {
		expect(unsupportedOAuthScopes(["openid", "relationships", "teams"])).toEqual([
			"relationships",
		]);
		expect(() => assertSupportedOAuthScopes(["relationships"], "test")).toThrow(
			"Unsupported OAuth scope in test: relationships",
		);
	});
});
