import { describe, expect, it, vi } from "vitest";

import {
	formatPromotionResult,
	parsePromotionArgs,
	runCLI,
} from "./promote-admin.mjs";

describe("promote admin script", () => {
	it("parses local and remote promotion arguments", () => {
		expect(parsePromotionArgs(["alice@example.com"])).toEqual({
			help: false,
			mode: "local",
			email: "alice@example.com",
		});
		expect(parsePromotionArgs(["--mode=remote", "--email", "alice@example.com"])).toEqual({
			help: false,
			mode: "remote",
			email: "alice@example.com",
		});
	});

	it("rejects ambiguous promotion arguments", () => {
		expect(() => parsePromotionArgs([])).toThrow("exactly one user email");
		expect(() => parsePromotionArgs(["not-an-email"])).toThrow("valid user email");
		expect(() => parsePromotionArgs(["--mode", "prod", "alice@example.com"])).toThrow(
			"Unknown promotion mode",
		);
		expect(() =>
			parsePromotionArgs(["remote", "--mode", "local", "alice@example.com"]),
		).toThrow("Pass only one promotion mode");
	});

	it("formats successful and idempotent outcomes", () => {
		expect(
			formatPromotionResult({
				status: "promoted",
				user: { email: "alice@example.com" },
			}),
		).toBe("alice@example.com is now an admin.\n");
		expect(
			formatPromotionResult({
				status: "already-admin",
				user: { email: "alice@example.com" },
			}),
		).toBe("alice@example.com is already an admin.\n");
	});

	it("returns a non-zero CLI status for invalid input before opening D1", async () => {
		const stderr = { write: vi.fn() };
		const platformFactory = vi.fn();
		const exitCode = await runCLI({
			args: [],
			stderr,
			stdout: { write: vi.fn() },
			platformFactory,
		});

		expect(exitCode).toBe(1);
		expect(platformFactory).not.toHaveBeenCalled();
		expect(stderr.write.mock.calls.flat().join("")).toContain("exactly one user email");
	});
});
