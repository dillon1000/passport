import { describe, expect, it } from "vitest";

import {
	CLIENT_API_PROTECTED_RESOURCE_METADATA_PATH,
	clientAPIAuthorizationServerIssuer,
	clientAPIBearerChallenge,
	clientAPIProtectedResourceMetadata,
	clientAPIProtectedResourceMetadataURL,
	clientAPIResourceIdentifier,
	insufficientClientAPIScopeError,
	invalidClientAPITokenError,
} from "./client-api-http";

describe("delegated client API HTTP contract", () => {
	it("builds the fixed resource identifier and authorization-server issuer", () => {
		expect(clientAPIResourceIdentifier("https://passport.test/")).toBe(
			"https://passport.test/api/v1",
		);
		expect(clientAPIAuthorizationServerIssuer("https://passport.test/")).toBe(
			"https://passport.test/api/auth",
		);
		expect(clientAPIProtectedResourceMetadataURL("https://passport.test/")).toBe(
			`https://passport.test${CLIENT_API_PROTECTED_RESOURCE_METADATA_PATH}`,
		);
	});

	it("publishes RFC 9728 protected-resource metadata for header bearer tokens", () => {
		const metadata = clientAPIProtectedResourceMetadata("https://passport.test");

		expect(metadata).toMatchObject({
			resource: "https://passport.test/api/v1",
			authorization_servers: ["https://passport.test/api/auth"],
			bearer_methods_supported: ["header"],
			resource_name: "Passport Delegated Resource API",
		});
		expect(metadata.scopes_supported).toEqual(
			expect.arrayContaining([
				"profile:write",
				"organizations:write",
				"teams:write",
				"billing:checkout",
			]),
		);
	});

	it("returns stable JSON and RFC 6750 details for invalid tokens", async () => {
		const response = invalidClientAPITokenError("https://passport.test").toResponse();

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: {
				code: "invalid_token",
				message: "The bearer access token is missing, invalid, or expired.",
			},
		});
		expect(response.headers.get("WWW-Authenticate")).toContain(
			'error="invalid_token"',
		);
		expect(response.headers.get("WWW-Authenticate")).toContain(
			'resource_metadata="https://passport.test/.well-known/oauth-protected-resource/api/v1"',
		);
	});

	it("advertises the missing scope on insufficient-scope responses", () => {
		const error = insufficientClientAPIScopeError("https://passport.test", [
			"teams:write",
		]);

		expect(error.status).toBe(403);
		expect(error.code).toBe("insufficient_scope");
		expect(error.headers.get("WWW-Authenticate")).toContain(
			'scope="teams:write"',
		);
		expect(
			clientAPIBearerChallenge({ passportOrigin: "https://passport.test" }),
		).toContain('realm="passport"');
	});
});
