import { describe, expect, it } from "vitest";

import type { AuthEnv } from "../../env";
import { oauthProviderPlugin } from "./oauth";

describe("OAuth provider configuration", () => {
	it("advertises standard grants plus introspection and revocation metadata through the provider", () => {
		const plugin = oauthProviderPlugin(
			{
				BETTER_AUTH_URL: "https://passport.test",
				OAUTH_RESOURCES: JSON.stringify([
					{
						identifier: "https://api.example.com",
						name: "Example API",
						scopes: ["permissions"],
					},
				]),
			} as unknown as AuthEnv,
			{} as never,
		);

		expect(plugin.options.grantTypes).toEqual([
			"authorization_code",
			"client_credentials",
			"refresh_token",
		]);
		expect(plugin.options.clientCredentialGrantDefaultScopes).toEqual([]);
		expect(plugin.options.validAudiences).toContain("https://api.example.com");
		expect(plugin.options.validAudiences).toContain("https://passport.test");
		expect(plugin.options.validAudiences).toContain("https://passport.test/api/v1");
		expect(Object.keys(plugin.endpoints)).toEqual(
			expect.arrayContaining(["oauth2Introspect", "oauth2Revoke"]),
		);
	});
});
