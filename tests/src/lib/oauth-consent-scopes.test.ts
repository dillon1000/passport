import { describe, expect, it } from "vitest";

import {
	consentScopeGroups,
	isOptionalConsentScope,
	oauthRedirectHost,
	safeOAuthClientName,
} from "./oauth-consent-scopes";

describe("OAuth consent scope presentation", () => {
	it("orders writes first, hides redundant subsets, and puts openid last", () => {
		const groups = consentScopeGroups([
			"openid",
			"profile",
			"profile:picture",
			"organizations",
			"organizations:ids",
			"teams",
			"teams:ids",
			"teams:write",
		]);

		expect(groups.map((group) => group.id)).toEqual(["write", "organization", "account"]);
		expect(groups[1]?.visibleScopes).toEqual(["organizations", "teams"]);
		expect(groups[2]?.visibleScopes).toEqual(["profile", "openid"]);
	});

	it("keeps baseline identity required and makes elevated access optional", () => {
		expect(isOptionalConsentScope("openid")).toBe(false);
		expect(isOptionalConsentScope("profile")).toBe(false);
		expect(isOptionalConsentScope("teams:write")).toBe(true);
		expect(isOptionalConsentScope("offline_access")).toBe(true);
	});

	it("sanitizes hostile names and parses redirect hosts", () => {
		expect(safeOAuthClientName("North\nwind\u202e.example", "Fallback")).toBe(
			"North wind .example",
		);
		expect(oauthRedirectHost("https://App.Example.com/oauth/callback")).toBe(
			"app.example.com",
		);
	});
});
