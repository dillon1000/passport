import { describe, expect, it, vi } from "vitest";

import {
	DEFAULT_ACCOUNT_LOCKOUT_COOLDOWN_SECONDS,
	accountLockoutPolicyFromEnv,
	isLockedOut,
	normalizeLockoutIdentifier,
	recordFailedCredentialAttempt,
} from "./account-lockout";

function createKVMock(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(
			async (
				key: string,
				value: string,
				options?: {
					expirationTtl?: number;
				},
			) => {
				void options;
				store.set(key, value);
			},
		),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
		store,
	};
}

describe("account lockout", () => {
	it("normalizes user-controlled identifiers before deriving storage keys", () => {
		expect(normalizeLockoutIdentifier("  User@Example.COM ")).toBe("user@example.com");
		expect(normalizeLockoutIdentifier("   ")).toBeNull();
	});

	it("treats future lockedUntil values as locked and expired values as clear", () => {
		const now = new Date("2026-06-18T12:00:00.000Z");

		expect(
			isLockedOut({ lockedUntil: "2026-06-18T12:05:00.000Z" }, now),
		).toBe(true);
		expect(
			isLockedOut({ lockedUntil: "2026-06-18T11:59:00.000Z" }, now),
		).toBe(false);
	});

	it("locks once when failed attempts cross the configured threshold", async () => {
		const kv = createKVMock();
		const policy = {
			enabled: true,
			threshold: 2,
			windowSeconds: 300,
			cooldownSeconds: DEFAULT_ACCOUNT_LOCKOUT_COOLDOWN_SECONDS,
		};
		const now = new Date("2026-06-18T12:00:00.000Z");

		await expect(
			recordFailedCredentialAttempt(kv, "user@example.com", policy, now),
		).resolves.toMatchObject({
			attempts: 1,
			locked: false,
			lockoutStarted: false,
		});
		await expect(
			recordFailedCredentialAttempt(kv, "user@example.com", policy, now),
		).resolves.toMatchObject({
			attempts: 2,
			locked: true,
			lockoutStarted: true,
		});
		await expect(
			recordFailedCredentialAttempt(kv, "user@example.com", policy, now),
		).resolves.toMatchObject({
			locked: true,
			lockoutStarted: false,
		});
	});

	it("parses lockout policy env values and rejects unsafe numbers", () => {
		expect(accountLockoutPolicyFromEnv({})).toMatchObject({
			enabled: true,
			threshold: 10,
			windowSeconds: 900,
			cooldownSeconds: 900,
		});
		expect(
			accountLockoutPolicyFromEnv({
				ACCOUNT_LOCKOUT_ENABLED: "false",
				ACCOUNT_LOCKOUT_THRESHOLD: "12",
				ACCOUNT_LOCKOUT_WINDOW_SECONDS: "1200",
				ACCOUNT_LOCKOUT_COOLDOWN_SECONDS: "1800",
			}),
		).toEqual({
			enabled: false,
			threshold: 12,
			windowSeconds: 1200,
			cooldownSeconds: 1800,
		});
		expect(() =>
			accountLockoutPolicyFromEnv({ ACCOUNT_LOCKOUT_THRESHOLD: "0" }),
		).toThrow("ACCOUNT_LOCKOUT_THRESHOLD must be an integer greater than or equal to 1.");
	});
});
