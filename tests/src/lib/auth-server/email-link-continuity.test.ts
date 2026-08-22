import { describe, expect, it } from "vitest";

import { emailLinkContinuationDestination } from "./email-link-continuity";

describe("emailLinkContinuationDestination", () => {
	it("preserves a signed OAuth authorization continuation after magic-link sign-in", () => {
		const destination =
			"/api/auth/oauth2/authorize?response_type=code&client_id=oauth-client&redirect_uri=https%3A%2F%2Fclient.example.com%2Fcallback&scope=openid+email&state=state-123&sig=signed";

		expect(emailLinkContinuationDestination(destination)).toBe(destination);
	});

	it("adds a reset token without replacing the preserved post-login callback", () => {
		expect(
			emailLinkContinuationDestination(
				"/sign-in?flow=reset-password&callbackURL=%2Fapi%2Fauth%2Foauth2%2Fauthorize%3Fclient_id%3Doauth-client%26sig%3Dsigned",
				"reset-token",
			),
		).toBe(
			"/sign-in?flow=reset-password&callbackURL=%2Fapi%2Fauth%2Foauth2%2Fauthorize%3Fclient_id%3Doauth-client%26sig%3Dsigned&token=reset-token",
		);
	});
});
