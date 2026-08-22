import { describe, expect, it, vi } from "vitest";

import {
	enforceSignInMethodRateLimit,
	SIGN_IN_METHOD_RATE_LIMIT,
} from "./sign-in-method-rate-limit";

function createKV(initialCount = 0) {
	let stored: { count: number; resetAt: number } | null = null;
	return {
		get: vi.fn(async () => stored ?? (initialCount ? { count: initialCount, resetAt: 60 } : null)),
		put: vi.fn(async (_key: string, value: string) => {
			stored = JSON.parse(value);
		}),
	};
}

describe("enforceSignInMethodRateLimit", () => {
	it("allows discovery within the current window", async () => {
		const result = await enforceSignInMethodRateLimit(
			createKV(),
			"203.0.113.7",
			new Date(1_000),
		);

		expect(result.allowed).toBe(true);
		expect(result.headers.get("RateLimit-Remaining")).toBe(String(SIGN_IN_METHOD_RATE_LIMIT - 1));
	});

	it("rejects discovery after the window limit", async () => {
		const result = await enforceSignInMethodRateLimit(
			createKV(SIGN_IN_METHOD_RATE_LIMIT),
			"203.0.113.7",
			new Date(1_000),
		);

		expect(result.allowed).toBe(false);
		expect(result.headers.get("Retry-After")).toBe("59");
	});
});
