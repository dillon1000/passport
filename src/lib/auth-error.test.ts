import { describe, expect, it } from "vitest";

import { authErrorDetails } from "./auth-error";

describe("authErrorDetails", () => {
	it("returns the Better Auth error code and description from the query string", () => {
		expect(
			authErrorDetails(
				new URLSearchParams({
					error: "invalid_request",
					error_description: "The OAuth state value did not match.",
				}),
			),
		).toEqual({
			code: "invalid_request",
			description: "The OAuth state value did not match.",
		});
	});

	it("falls back to a safe generic error when details are missing or malformed", () => {
		expect(
			authErrorDetails(
				new URLSearchParams({
					error: "<script>",
				}),
			),
		).toEqual({
			code: "UNKNOWN",
			description: "The authentication request could not be completed.",
		});
	});

	it("normalizes long error descriptions for display", () => {
		const details = authErrorDetails(
			new URLSearchParams({
				error: "server_error",
				error_description: `${"Auth service ".repeat(30)}\n\nretry later`,
			}),
		);

		expect(details.description).toHaveLength(243);
		expect(details.description.endsWith("...")).toBe(true);
		expect(details.description).not.toContain("\n");
	});
});
