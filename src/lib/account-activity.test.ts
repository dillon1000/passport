import { describe, expect, it } from "vitest";

import {
	ACCOUNT_ACTIVITY_LABELS,
	ACCOUNT_ACTIVITY_TYPES,
	accountActivityLabel,
	accountActivityTypeForPath,
} from "./account-activity";

describe("account activity taxonomy", () => {
	it("maps known Better Auth paths to stable activity types", () => {
		expect(accountActivityTypeForPath("/change-password")).toBe(
			ACCOUNT_ACTIVITY_TYPES.PASSWORD_CHANGED,
		);
		expect(accountActivityTypeForPath("/passkey/verify-registration")).toBe(
			ACCOUNT_ACTIVITY_TYPES.PASSKEY_ADDED,
		);
		expect(accountActivityTypeForPath("/two-factor/verify-totp")).toBe(
			ACCOUNT_ACTIVITY_TYPES.TWO_FACTOR_ENABLED,
		);
	});

	it("returns null for unknown or missing paths", () => {
		expect(accountActivityTypeForPath("/sign-in/email")).toBeNull();
		expect(accountActivityTypeForPath(undefined)).toBeNull();
		expect(accountActivityTypeForPath("")).toBeNull();
	});

	it("preserves the security-alert wording for credential events", () => {
		// These labels also drive security alert email subjects, so they must not
		// drift from the originals.
		expect(ACCOUNT_ACTIVITY_LABELS.password_changed).toBe("Password changed");
		expect(ACCOUNT_ACTIVITY_LABELS.two_factor_enabled).toBe(
			"Two-factor authentication enabled",
		);
		expect(ACCOUNT_ACTIVITY_LABELS.passkey_removed).toBe("Passkey removed");
	});

	it("labels every defined type and falls back to a humanized slug", () => {
		for (const type of Object.values(ACCOUNT_ACTIVITY_TYPES)) {
			expect(accountActivityLabel(type)).toBe(ACCOUNT_ACTIVITY_LABELS[type]);
		}
		expect(accountActivityLabel("some_future_event")).toBe("Some Future Event");
	});
});
