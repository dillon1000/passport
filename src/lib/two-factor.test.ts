import { describe, expect, it } from "vitest";

import { normalizeTwoFactorVerificationCode } from "./two-factor";

describe("normalizeTwoFactorVerificationCode", () => {
	it("trims accidental surrounding whitespace from backup codes", () => {
		expect(normalizeTwoFactorVerificationCode("backup", "  abcd-1234  ")).toBe("abcd-1234");
	});

	it("does not alter the meaningful body of one-time codes", () => {
		expect(normalizeTwoFactorVerificationCode("totp", " 123456 ")).toBe("123456");
		expect(normalizeTwoFactorVerificationCode("otp", " 654321 ")).toBe("654321");
	});
});
