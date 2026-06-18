import { describe, expect, it } from "vitest";

import {
	consentMetadataFromRegisteredClient,
	consentMetadataFromSeedClient,
} from "./oauth-client-metadata";

describe("OAuth client consent metadata", () => {
	it("normalizes registered clients without credential fields", () => {
		const metadata = consentMetadataFromRegisteredClient({
			clientId: "client_123",
			name: "Dashboard",
			redirectUris: ["https://app.example.com/callback"],
			postLogoutRedirectUris: [],
			scopes: ["openid", "email"],
			uri: "https://app.example.com",
			icon: "https://app.example.com/icon.png",
			tos: "https://app.example.com/terms",
			policy: "https://app.example.com/privacy",
			public: false,
			disabled: true,
		});

		expect(metadata).toEqual({
			clientId: "client_123",
			name: "Dashboard",
			redirectUris: ["https://app.example.com/callback"],
			scopes: ["openid", "email"],
			uri: "https://app.example.com",
			icon: "https://app.example.com/icon.png",
			tos: "https://app.example.com/terms",
			policy: "https://app.example.com/privacy",
			public: false,
			disabled: true,
			source: "database",
		});
		expect(metadata).not.toHaveProperty("clientSecret");
	});

	it("normalizes trusted seed clients as display-only metadata", () => {
		expect(
			consentMetadataFromSeedClient({
				id: "seed_client",
				secret: "not-returned",
				name: "Seed Client",
				redirectUris: ["https://seed.example.com/callback"],
				scopes: ["openid"],
				public: true,
			}),
		).toEqual({
			clientId: "seed_client",
			name: "Seed Client",
			redirectUris: ["https://seed.example.com/callback"],
			scopes: ["openid"],
			public: true,
			disabled: false,
			source: "seed",
		});
	});
});
