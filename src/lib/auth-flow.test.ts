import { describe, expect, it } from "vitest";

import {
	resolveAddAccountURL,
	resolveAuthCallbackURL,
	resolvePasswordResetRedirectURL,
	shouldCompletePasswordSignIn,
} from "./auth-flow";

describe("shouldCompletePasswordSignIn", () => {
	it("does not complete the normal redirect while two-factor auth is pending", () => {
		expect(
			shouldCompletePasswordSignIn({
				data: {
					twoFactorRedirect: true,
					twoFactorMethods: ["totp", "otp"],
				},
				error: null,
			}),
		).toBe(false);
	});

	it("completes the normal redirect for an established password session", () => {
		expect(
			shouldCompletePasswordSignIn({
				data: {
					redirect: true,
					token: "session-token",
					url: "/account",
					user: { id: "user_123" },
				},
				error: null,
			}),
		).toBe(true);
	});
});

describe("resolveAuthCallbackURL", () => {
	it("uses an explicit callbackURL query parameter first", () => {
		const params = new URLSearchParams({
			callbackURL: "/security",
			client_id: "oauth-client",
			redirect_uri: "https://client.example.com/callback",
			sig: "signed",
		});

		expect(resolveAuthCallbackURL(params)).toBe("/security");
	});

	it("returns the signed OAuth authorize continuation when sign-in was opened by OAuth", () => {
		const params = new URLSearchParams({
			response_type: "code",
			client_id: "oauth-client",
			redirect_uri: "https://client.example.com/callback",
			scope: "openid email",
			state: "state-123",
			sig: "signed",
		});

		expect(resolveAuthCallbackURL(params)).toBe(
			"/api/auth/oauth2/authorize?response_type=code&client_id=oauth-client&redirect_uri=https%3A%2F%2Fclient.example.com%2Fcallback&scope=openid+email&state=state-123&sig=signed",
		);
	});

	it("falls back to the account dashboard for ordinary sign-ins", () => {
		expect(resolveAuthCallbackURL(new URLSearchParams())).toBe("/account");
	});
});

describe("resolvePasswordResetRedirectURL", () => {
	it("returns an absolute sign-in reset URL with the post-reset callback preserved", () => {
		const params = new URLSearchParams({
			callbackURL: "/security",
		});

		expect(resolvePasswordResetRedirectURL(params, "https://passport.test")).toBe(
			"https://passport.test/sign-in?flow=reset-password&callbackURL=%2Fsecurity",
		);
	});

	it("preserves signed OAuth authorization continuations as a single callbackURL value", () => {
		const params = new URLSearchParams({
			response_type: "code",
			client_id: "oauth-client",
			redirect_uri: "https://client.example.com/callback",
			scope: "openid email",
			state: "state-123",
			sig: "signed",
		});

		expect(resolvePasswordResetRedirectURL(params, "https://passport.test")).toBe(
			"https://passport.test/sign-in?flow=reset-password&callbackURL=%2Fapi%2Fauth%2Foauth2%2Fauthorize%3Fresponse_type%3Dcode%26client_id%3Doauth-client%26redirect_uri%3Dhttps%253A%252F%252Fclient.example.com%252Fcallback%26scope%3Dopenid%2Bemail%26state%3Dstate-123%26sig%3Dsigned",
		);
	});
});

describe("resolveAddAccountURL", () => {
	it("opens sign-in in add-account mode and returns to sessions by default", () => {
		expect(resolveAddAccountURL()).toBe(
			"/sign-in?flow=add-account&callbackURL=%2Fsessions",
		);
	});

	it("uses only safe relative callback URLs", () => {
		expect(resolveAddAccountURL("/organizations")).toBe(
			"/sign-in?flow=add-account&callbackURL=%2Forganizations",
		);
		expect(resolveAddAccountURL("https://evil.example")).toBe(
			"/sign-in?flow=add-account&callbackURL=%2Fsessions",
		);
	});
});
