import { describe, expect, it } from "vitest";

import { createAppQueryClient, queryKeys, readAPIJSON } from "./query-client";

describe("createAppQueryClient", () => {
	it("uses conservative defaults for dashboard server state", () => {
		const queryClient = createAppQueryClient();
		const queryOptions = queryClient.getDefaultOptions().queries;

		expect(queryOptions?.staleTime).toBe(30_000);
		expect(queryOptions?.retry).toBe(1);
		expect(queryOptions?.refetchOnWindowFocus).toBe(false);
	});
});

describe("readAPIJSON", () => {
	it("returns typed JSON for successful responses", async () => {
		const result = await readAPIJSON<{ ok: true }>(
			new Response(JSON.stringify({ ok: true }), {
				headers: { "content-type": "application/json" },
			}),
		);

		expect(result).toEqual({ ok: true });
	});

	it("throws the API error message for failed responses", async () => {
		await expect(
			readAPIJSON(
				new Response(JSON.stringify({ error: "Access denied." }), {
					status: 403,
					headers: { "content-type": "application/json" },
				}),
			),
		).rejects.toThrow("Access denied.");
	});
});

describe("queryKeys", () => {
	it("keeps identity-specific keys stable and serializable", () => {
		expect(queryKeys.accountActivity("user_123")).toEqual(["account-activity", "user_123"]);
		expect(queryKeys.adminUsers({ offset: 25, search: "dillon@example.com" })).toEqual([
			"admin-users",
			{ offset: 25, search: "dillon@example.com" },
		]);
	});
});
