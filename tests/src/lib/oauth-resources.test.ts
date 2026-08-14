import { describe, expect, it } from "vitest";

import {
	PASSPORT_ALLOWED_AUDIENCES_METADATA_KEY,
	allowedAudiencesFromMetadata,
	assertOAuthClientResourceAccess,
	metadataWithAllowedAudiences,
	parseOAuthResourceSeeds,
} from "./oauth-resources";

describe("OAuth resource registry", () => {
	it("parses configured resource audiences and validates their scopes", () => {
		expect(
			parseOAuthResourceSeeds(
				JSON.stringify([
					{
						identifier: "https://api.example.com",
						name: "Example API",
						scopes: ["permissions", "organizations"],
					},
				]),
			),
		).toEqual([
			{
				identifier: "https://api.example.com",
				name: "Example API",
				scopes: ["permissions", "organizations"],
			},
		]);
	});

	it("rejects malformed resource registries with clear messages", () => {
		expect(() => parseOAuthResourceSeeds("{}")).toThrow(
			"OAUTH_RESOURCES must be a JSON array.",
		);
		expect(() =>
			parseOAuthResourceSeeds(
				JSON.stringify([
					{
						identifier: "https://api.example.com",
						name: "Example API",
						scopes: ["relationships"],
					},
				]),
			),
		).toThrow("Unsupported OAuth scope in OAUTH_RESOURCES: relationships");
	});

	it("round-trips client allowed audiences through Passport metadata", () => {
		const metadata = metadataWithAllowedAudiences(["https://api.example.com"]);

		expect(metadata).toEqual({
			[PASSPORT_ALLOWED_AUDIENCES_METADATA_KEY]: ["https://api.example.com"],
		});
		expect(allowedAudiencesFromMetadata(metadata)).toEqual(["https://api.example.com"]);
		expect(allowedAudiencesFromMetadata({})).toBeUndefined();
	});

	it("enforces client and resource scope boundaries for client_credentials", () => {
		const resources = parseOAuthResourceSeeds(
			JSON.stringify([
				{
					identifier: "https://api.example.com",
					name: "Example API",
					scopes: ["permissions"],
				},
			]),
		);

		expect(() =>
			assertOAuthClientResourceAccess({
				resources,
				resource: "https://api.example.com",
				allowedAudiences: ["https://api.example.com"],
				clientScopes: ["permissions"],
				requestedScopes: ["permissions"],
			}),
		).not.toThrow();
		expect(() =>
			assertOAuthClientResourceAccess({
				resources,
				resource: "https://api.example.com",
				allowedAudiences: ["https://other-api.example.com"],
				clientScopes: ["permissions"],
				requestedScopes: ["permissions"],
			}),
		).toThrow("requested resource is not allowed for this client");
		expect(() =>
			assertOAuthClientResourceAccess({
				resources,
				resource: "https://api.example.com",
				allowedAudiences: ["https://api.example.com"],
				clientScopes: ["permissions", "organizations"],
				requestedScopes: ["organizations"],
			}),
		).toThrow("scope is not allowed for the requested resource: organizations");
	});
});
