import { describe, expect, it } from "vitest";

import {
	OAUTH_CONSENT_ENDPOINT,
	oauthConsentRedirect,
	oauthConsentRequestBody,
	oauthQueryFromLocationSearch,
} from "./oauth-consent";

describe("oauth consent helpers", () => {
	it("uses the Better Auth-mounted OAuth provider consent endpoint", () => {
		expect(OAUTH_CONSENT_ENDPOINT).toBe("/api/auth/oauth2/consent");
	});

	it("preserves the raw signed query string for the provider consent body", () => {
		const search =
			"?response_type=code&scope=openid+profile&ba_param=scope&sig=a%2Bb%3D";

		expect(oauthQueryFromLocationSearch(search)).toBe(
			"response_type=code&scope=openid+profile&ba_param=scope&sig=a%2Bb%3D",
		);
		expect(oauthConsentRequestBody(search, true)).toEqual({
			accept: true,
			oauth_query: "response_type=code&scope=openid+profile&ba_param=scope&sig=a%2Bb%3D",
		});
	});

	it("does not build a consent body without an OAuth query", () => {
		expect(oauthConsentRequestBody("", true)).toBeNull();
	});

	it("reads redirect URLs from current and legacy response shapes", () => {
		expect(oauthConsentRedirect({ redirect_uri: "https://client.test/current" })).toBe(
			"https://client.test/current",
		);
		expect(oauthConsentRedirect({ redirectURI: "https://client.test/legacy" })).toBe(
			"https://client.test/legacy",
		);
		expect(oauthConsentRedirect({ url: "https://client.test/url" })).toBe(
			"https://client.test/url",
		);
	});
});
