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

		expect(groups.map((group) => group.id)).toEqual(["write", "identity", "organization"]);
		expect(groups[1]?.visibleScopes).toEqual(["profile", "openid"]);
		expect(groups[2]?.visibleScopes).toEqual(["organizations", "teams"]);
	});

	it("keeps scopes required unless the client explicitly marks them optional", () => {
		expect(isOptionalConsentScope("phone")).toBe(false);
		expect(isOptionalConsentScope("phone", ["phone"])).toBe(true);

		const [phone] = consentScopeGroups(["phone"], ["phone"]);
		expect(phone?.optionalScopes).toEqual(["phone"]);
		expect(phone?.requiredScopes).toEqual([]);
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
