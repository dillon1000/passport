import { describe, expect, it } from "vitest";

import { captchaFetchOptions, captchaRequirementMessage, type CaptchaConfig } from "./captcha-config";

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
});
