import { describe, expect, it } from "vitest";

import { auditMetadataJSON, sanitizeAuditMetadata } from "./admin-audit";

describe("admin audit helpers", () => {
	it("removes secret-like fields from nested metadata", () => {
		expect(
			sanitizeAuditMetadata({
				before: { name: "Old Client", clientSecret: "old-secret" },
				after: { name: "New Client", accessToken: "token-value" },
				nested: [{ passwordHash: "hash", safe: "kept" }],
				authorizationHeader: "Bearer token",
			}),
		).toEqual({
			before: { name: "Old Client" },
			after: { name: "New Client" },
			nested: [{ safe: "kept" }],
		});
	});

	it("serializes sanitized metadata for storage", () => {
		expect(auditMetadataJSON({ action: "rotate", clientSecret: "secret-once" })).toBe(
			'{"action":"rotate"}',
		);
		expect(auditMetadataJSON(undefined)).toBeNull();
	});
});
