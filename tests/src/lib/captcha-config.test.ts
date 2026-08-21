import { describe, expect, it, vi } from "vitest";

import {
	captchaFetchOptions,
	captchaRequirementMessage,
	resolveCaptchaFetchOptions,
	type CaptchaConfig,
} from "./captcha-config";

describe("captchaRequirementMessage", () => {
	it("waits for runtime captcha settings before protected auth actions continue", () => {
		const config = { loaded: false, enabled: false } satisfies CaptchaConfig;

		expect(captchaRequirementMessage(config, "")).toBe("Captcha is still loading.");
	});

	it("requires a token when runtime captcha settings are enabled", () => {
		const config = { loaded: true, enabled: true } satisfies CaptchaConfig;

		expect(captchaRequirementMessage(config, "")).toBe("Complete the captcha challenge.");
	});

	it("allows actions when captcha is disabled or already completed", () => {
		expect(captchaRequirementMessage({ loaded: true, enabled: false }, "")).toBeNull();
		expect(captchaRequirementMessage({ loaded: true, enabled: true }, "token")).toBeNull();
	});
});

describe("captchaFetchOptions", () => {
	it("adds the Better Auth captcha header only when a challenge is enabled", () => {
		const config = { loaded: true, enabled: true } satisfies CaptchaConfig;

		expect(captchaFetchOptions(config, "token")).toEqual({
			headers: {
				"x-captcha-response": "token",
			},
		});
		expect(captchaFetchOptions({ loaded: true, enabled: false }, "")).toBeUndefined();
	});

	it("waits for the invisible widget before building protected request headers", async () => {
		const config = { loaded: true, enabled: true } satisfies CaptchaConfig;
		const solve = vi.fn(async () => "solved-token");

		await expect(resolveCaptchaFetchOptions(config, "", solve)).resolves.toEqual({
			headers: { "x-captcha-response": "solved-token" },
		});
		expect(solve).toHaveBeenCalledOnce();
	});

	it("uses an existing token without starting another solve", async () => {
		const solve = vi.fn(async () => "replacement-token");

		await expect(
			resolveCaptchaFetchOptions({ loaded: true, enabled: true }, "existing-token", solve),
		).resolves.toEqual({ headers: { "x-captcha-response": "existing-token" } });
		expect(solve).not.toHaveBeenCalled();
	});

	it("pauses when configuration or a challenge token is unavailable", async () => {
		await expect(
			resolveCaptchaFetchOptions({ loaded: false, enabled: false }, "", null),
		).resolves.toBeNull();
		await expect(
			resolveCaptchaFetchOptions({ loaded: true, enabled: true }, "", async () => ""),
		).resolves.toBeNull();
	});
});
