import { afterEach, describe, expect, it, vi } from "vitest";

import { authLogger, buildAuthRateLimitOptions } from "./config";

describe("auth rate limit options", () => {
	it("uses KV-backed secondary storage and conservative auth-sensitive rules", () => {
		expect(buildAuthRateLimitOptions({})).toEqual({
			enabled: true,
			window: 60,
			max: 120,
			storage: "secondary-storage",
			customRules: {
				"/sign-in/email": { window: 60, max: 10 },
				"/sign-up/email": { window: 300, max: 10 },
				"/forget-password": { window: 300, max: 5 },
				"/reset-password": { window: 300, max: 10 },
				"/two-factor/*": { window: 60, max: 10 },
				"/phone-number/*": { window: 60, max: 10 },
				"/email-otp/*": { window: 60, max: 10 },
				"/magic-link/*": { window: 300, max: 5 },
			},
		});
	});

	it("parses rate-limit env overrides", () => {
		expect(
			buildAuthRateLimitOptions({
				AUTH_RATE_LIMIT_ENABLED: "false",
				AUTH_RATE_LIMIT_WINDOW_SECONDS: "30",
				AUTH_RATE_LIMIT_MAX: "50",
				AUTH_SENSITIVE_RATE_LIMIT_WINDOW_SECONDS: "120",
				AUTH_SENSITIVE_RATE_LIMIT_MAX: "4",
			}),
		).toMatchObject({
			enabled: false,
			window: 30,
			max: 50,
			customRules: {
				"/sign-in/email": { window: 120, max: 4 },
				"/two-factor/*": { window: 120, max: 4 },
			},
		});
		expect(() =>
			buildAuthRateLimitOptions({ AUTH_RATE_LIMIT_MAX: "0" }),
		).toThrow("AUTH_RATE_LIMIT_MAX must be an integer greater than or equal to 1.");
	});
});

describe("auth logger", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("suppresses the benign one-time-purchase Stripe webhook error", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		authLogger.log?.(
			"error",
			"Stripe webhook failed. Error: No such subscription: 'null'",
		);
		expect(error).not.toHaveBeenCalled();
	});

	it("passes through unrelated errors with Better Auth formatting", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		authLogger.log?.("error", "Real failure");
		expect(error).toHaveBeenCalledTimes(1);
		expect(error.mock.calls[0][0]).toContain("ERROR [Better Auth]: Real failure");
	});

	it("does not suppress a genuine subscription error that mentions stripe", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		authLogger.log?.("error", "Stripe webhook failed. Error: card declined");
		expect(error).toHaveBeenCalledTimes(1);
	});
});
