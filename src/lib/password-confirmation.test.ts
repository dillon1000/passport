import { describe, expect, it } from "vitest";

import {
	getPasswordConfirmationError,
	isPasswordConfirmationReady,
} from "./password-confirmation";

describe("password confirmation", () => {
	it("requires a verification password", () => {
		expect(getPasswordConfirmationError("CorrectHorse1!", "")).toBe("Verify your password.");
		expect(isPasswordConfirmationReady("CorrectHorse1!", "")).toBe(false);
	});

	it("rejects mismatched passwords", () => {
		expect(getPasswordConfirmationError("CorrectHorse1!", "CorrectHorse2!")).toBe(
			"Passwords don't match.",
		);
		expect(isPasswordConfirmationReady("CorrectHorse1!", "CorrectHorse2!")).toBe(false);
	});

	it("accepts matching passwords", () => {
		expect(getPasswordConfirmationError("CorrectHorse1!", "CorrectHorse1!")).toBeNull();
		expect(isPasswordConfirmationReady("CorrectHorse1!", "CorrectHorse1!")).toBe(true);
	});
});
