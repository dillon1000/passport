import { describe, expect, it } from "vitest";

import {
	CLIENT_REGISTRATION_ALLOWED_SCOPES,
	DELEGATED_CLIENT_API_SCOPES,
	DEFAULT_CLIENT_REGISTRATION_SCOPES,
	SUPPORTED_OAUTH_SCOPES,
	assertSupportedOAuthScopes,
	defaultClientScopeString,
	oauthScopeConsentText,
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
			"profile:write",
			"organizations",
			"organizations:ids",
			"organizations:roles",
			"organizations:write",
			"organization-invitations:read",
			"organization-invitations:write",
			"organization-members:read",
			"organization-members:write",
			"teams",
			"teams:ids",
			"teams:write",
			"team-members:read",
			"team-members:write",
			"permissions",
			"platform:admin",
			"account:security",
			"connections",
			"billing:status",
			"billing:subscriptions",
			"billing:purchases",
			"billing:entitlements",
			"billing:limits",
			"billing:checkout",
			"billing:manage",
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
			"profile:write",
			"organizations",
			"organizations:ids",
			"organizations:roles",
			"organizations:write",
			"organization-invitations:read",
			"organization-invitations:write",
			"organization-members:read",
			"organization-members:write",
			"teams",
			"teams:ids",
			"teams:write",
			"team-members:read",
			"team-members:write",
			"permissions",
			"account:security",
			"connections",
			"billing:status",
			"billing:subscriptions",
			"billing:purchases",
			"billing:entitlements",
			"billing:limits",
			"billing:checkout",
			"billing:manage",
		]);
		expect(supportedScopeString()).toBe(
			"openid profile email phone offline_access profile:picture profile:username profile:write organizations organizations:ids organizations:roles organizations:write organization-invitations:read organization-invitations:write organization-members:read organization-members:write teams teams:ids teams:write team-members:read team-members:write permissions platform:admin account:security connections billing:status billing:subscriptions billing:purchases billing:entitlements billing:limits billing:checkout billing:manage",
		);
	});

	it("publishes only scopes accepted by the delegated resource API", () => {
		expect(DELEGATED_CLIENT_API_SCOPES).toEqual([
			"profile:write",
			"organizations",
			"organizations:write",
			"organization-invitations:read",
			"organization-invitations:write",
			"organization-members:read",
			"organization-members:write",
			"teams",
			"teams:write",
			"team-members:read",
			"team-members:write",
			"billing:subscriptions",
			"billing:purchases",
			"billing:checkout",
			"billing:manage",
		]);
	});

	it("reports unsupported scope names without hiding the valid ones", () => {
		expect(unsupportedOAuthScopes(["openid", "relationships", "teams"])).toEqual([
			"relationships",
		]);
		expect(() => assertSupportedOAuthScopes(["relationships"], "test")).toThrow(
			"Unsupported OAuth scope in test: relationships",
		);
	});

	it("uses neutral consent copy for unsupported scopes", () => {
		expect(oauthScopeConsentText("openid")).toBe("Verify your identity");
		expect(oauthScopeConsentText("relationships:read")).toBe("Review requested access");
	});
});
