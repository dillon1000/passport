import { describe, expect, it } from "vitest";

import { CAPTCHA_ENDPOINTS } from "./captcha-endpoints";

describe("CAPTCHA_ENDPOINTS", () => {
	it("protects every unauthenticated sign-in initiation path used by the app", () => {
		expect(CAPTCHA_ENDPOINTS).toEqual([
			"/sign-up/email",
			"/sign-in/email",
			"/sign-in/username",
			"/request-password-reset",
			"/sign-in/magic-link",
			"/sign-in/social",
			"/passkey/verify-authentication",
		]);
	});
});
