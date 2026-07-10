/** Public-contract tests for the delegated resource API metadata and OpenAPI surface. */
import { describe, expect, it } from "vitest";

import { createClientAPI } from "./client-api";

const contractEnv = {
	BETTER_AUTH_URL: "https://passport.test",
};

describe("delegated client API contract", () => {
	it("publishes RFC 9728 protected-resource metadata without CORS", async () => {
		const response = await createClientAPI().request(
			"https://passport.test/.well-known/oauth-protected-resource/api/v1",
			{},
			contractEnv as Env,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("access-control-allow-origin")).toBeNull();
		await expect(response.json()).resolves.toMatchObject({
			resource: "https://passport.test/api/v1",
			authorization_servers: ["https://passport.test/api/auth"],
			bearer_methods_supported: ["header"],
			scopes_supported: expect.arrayContaining(["profile:write", "teams:write", "billing:manage"]),
		});
	});

	it("generates OpenAPI operations for every delegated endpoint", async () => {
		const response = await createClientAPI().request(
			"https://passport.test/api/v1/openapi.json",
			{},
			contractEnv as Env,
		);
		expect(response.status).toBe(200);
		const document = (await response.json()) as { paths?: Record<string, unknown> };
		const paths = Object.keys(document.paths ?? {});
		expect(paths).toEqual(
			expect.arrayContaining([
				"/api/v1/me",
				"/api/v1/me/profile-picture",
				"/api/v1/organizations",
				"/api/v1/organizations/{organizationId}",
				"/api/v1/organizations/{organizationId}/leave",
				"/api/v1/organizations/{organizationId}/logo",
				"/api/v1/me/organization-invitations",
				"/api/v1/me/organization-invitations/{invitationId}/accept",
				"/api/v1/me/organization-invitations/{invitationId}/reject",
				"/api/v1/organizations/{organizationId}/invitations",
				"/api/v1/organizations/{organizationId}/invitations/{invitationId}",
				"/api/v1/organizations/{organizationId}/members",
				"/api/v1/organizations/{organizationId}/members/{memberId}",
				"/api/v1/organizations/{organizationId}/teams",
				"/api/v1/organizations/{organizationId}/teams/{teamId}",
				"/api/v1/organizations/{organizationId}/teams/{teamId}/logo",
				"/api/v1/organizations/{organizationId}/teams/{teamId}/members",
				"/api/v1/organizations/{organizationId}/teams/{teamId}/members/{userId}",
				"/api/v1/billing/products",
				"/api/v1/billing/products/{productId}",
				"/api/v1/billing/subscriptions",
				"/api/v1/billing/purchases",
				"/api/v1/billing/checkout-intents",
				"/api/v1/billing/portal-intents",
				"/api/v1/billing/subscriptions/{subscriptionId}/cancel-intents",
				"/api/v1/billing/subscriptions/{subscriptionId}/restore-intents",
			]),
		);
	});
});
