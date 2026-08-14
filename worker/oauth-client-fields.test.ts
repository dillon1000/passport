import { describe, expect, it } from "vitest";

import type { OAuthClientSummary } from "./app";
import { mergeOAuthClientPassportFields } from "./oauth-client-fields";

describe("OAuth client Passport-owned fields", () => {
	it("keeps back-channel logout URIs when listing Better Auth clients", () => {
		const clients: OAuthClientSummary[] = [
			{
				clientId: "client_with_logout",
				name: "Logout Client",
				redirectUris: ["https://app.example.com/callback"],
				backchannelLogoutUri: null,
			},
			{
				clientId: "client_without_logout",
				name: "Plain Client",
				redirectUris: ["https://plain.example.com/callback"],
				backchannelLogoutUri: null,
			},
		];

		const merged = mergeOAuthClientPassportFields(clients, [
			{
				clientId: "client_with_logout",
				backchannelLogoutUri: "https://app.example.com/oidc/backchannel-logout",
			},
		]);

		expect(merged).toEqual([
			{
				clientId: "client_with_logout",
				name: "Logout Client",
				redirectUris: ["https://app.example.com/callback"],
				backchannelLogoutUri: "https://app.example.com/oidc/backchannel-logout",
			},
			{
				clientId: "client_without_logout",
				name: "Plain Client",
				redirectUris: ["https://plain.example.com/callback"],
				backchannelLogoutUri: null,
			},
		]);
	});

	it("keeps grant types and allowed audiences when listing Better Auth clients", () => {
		const clients: OAuthClientSummary[] = [
			{
				clientId: "m2m-client",
				name: "M2M Client",
				redirectUris: [],
				backchannelLogoutUri: null,
			},
		];

		const merged = mergeOAuthClientPassportFields(clients, [
			{
				clientId: "m2m-client",
				backchannelLogoutUri: null,
				grantTypes: ["client_credentials"],
				allowedAudiences: ["https://api.example.com"],
			},
		]);

		expect(merged).toEqual([
			{
				clientId: "m2m-client",
				name: "M2M Client",
				redirectUris: [],
				backchannelLogoutUri: null,
				grantTypes: ["client_credentials"],
				allowedAudiences: ["https://api.example.com"],
			},
		]);
	});

	it("keeps the platform-admin-only policy when listing Better Auth clients", () => {
		const clients: OAuthClientSummary[] = [
			{
				clientId: "admin-app",
				name: "Admin app",
				redirectUris: ["https://app.example.com/callback"],
			},
		];

		const merged = mergeOAuthClientPassportFields(clients, [
			{
				clientId: "admin-app",
				backchannelLogoutUri: null,
				platformAdminOnly: true,
			},
		]);

		expect(merged[0]).toMatchObject({
			clientId: "admin-app",
			platformAdminOnly: true,
		});
	});
});
