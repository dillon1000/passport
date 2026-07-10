import { describe, expect, it, vi } from "vitest";

import {
	CLIENT_API_SENSITIVE_RATE_LIMIT,
	enforceClientAPIRateLimit,
} from "./client-api-rate-limit";

function memoryKV() {
	const values = new Map<string, string>();
	return {
		get: vi.fn(async (key: string) => {
			const value = values.get(key);
			return value ? JSON.parse(value) : null;
		}),
		put: vi.fn(async (key: string, value: string) => {
			values.set(key, value);
		}),
	} as unknown as KVNamespace;
}

describe("delegated client API rate limits", () => {
	it("allows ten sensitive operations per client and user each minute", async () => {
		const kv = memoryKV();
		const actor = { clientId: "client_1", userId: "user_1" };
		const now = new Date("2026-07-10T12:00:15.000Z");

		for (let count = 0; count < CLIENT_API_SENSITIVE_RATE_LIMIT; count += 1) {
			const result = await enforceClientAPIRateLimit(kv, actor, {
				sensitive: true,
				now,
			});
			expect(result.remaining).toBe(CLIENT_API_SENSITIVE_RATE_LIMIT - count - 1);
		}

		await expect(
			enforceClientAPIRateLimit(kv, actor, { sensitive: true, now }),
		).rejects.toMatchObject({
			status: 429,
			code: "rate_limit_exceeded",
		});
	});

	it("uses independent standard and sensitive buckets", async () => {
		const kv = memoryKV();
		const actor = { clientId: "client_1", userId: "user_1" };
		const now = new Date("2026-07-10T12:00:15.000Z");

		const standard = await enforceClientAPIRateLimit(kv, actor, { now });
		const sensitive = await enforceClientAPIRateLimit(kv, actor, {
			sensitive: true,
			now,
		});

		expect(standard.remaining).toBe(119);
		expect(sensitive.remaining).toBe(9);
	});
});
