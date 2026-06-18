import { describe, expect, it } from "vitest";

import {
	AUTH_ADVANCED_OPTIONS,
	AUTH_ERROR_PATH,
	AUTH_SESSION_OPTIONS,
	AUTH_SESSION_COOKIE_NAME,
	isNewSignInIPAddress,
	isAdminOperator,
} from "./auth";

describe("auth API error and cookie options", () => {
	it("routes Better Auth API errors to the custom app page", () => {
		expect(AUTH_ERROR_PATH).toBe("/auth/error");
	});

	it("uses a non-default session token cookie name", () => {
		expect(AUTH_ADVANCED_OPTIONS.cookiePrefix).toBe("passport");
		expect(AUTH_ADVANCED_OPTIONS.cookies?.session_token?.name).toBe(
			AUTH_SESSION_COOKIE_NAME,
		);
		expect(AUTH_SESSION_COOKIE_NAME).not.toBe("session_token");
		expect(AUTH_SESSION_COOKIE_NAME).not.toBe("better-auth.session_token");
	});

	it("keeps session rows in Postgres when secondary storage is enabled", () => {
		expect(AUTH_SESSION_OPTIONS.storeSessionInDatabase).toBe(true);
	});
});

describe("isAdminOperator", () => {
	it("accepts Better Auth role admins for server-side OAuth client privileges", () => {
		expect(
			isAdminOperator(
				{ ADMIN_EMAILS: "bootstrap@example.com" },
				{ id: "user_123", email: "role-admin@example.com", role: "admin" },
			),
		).toBe(true);
	});

	it("keeps bootstrap email and user-id admin fallbacks", () => {
		expect(
			isAdminOperator(
				{ ADMIN_EMAILS: "admin@example.com" },
				{ id: "user_123", email: "admin@example.com", role: "user" },
			),
		).toBe(true);
		expect(
			isAdminOperator(
				{ ADMIN_EMAILS: "", ADMIN_USER_IDS: "user_123" },
				{ id: "user_123", email: "user@example.com", role: "user" },
			),
		).toBe(true);
	});

	it("rejects ordinary signed-in users", () => {
		expect(
			isAdminOperator(
				{ ADMIN_EMAILS: "admin@example.com", ADMIN_USER_IDS: "admin_123" },
				{ id: "user_123", email: "user@example.com", role: "user" },
			),
		).toBe(false);
	});
});

describe("isNewSignInIPAddress", () => {
	it("treats an unseen IP address as a new sign-in location", () => {
		expect(
			isNewSignInIPAddress("current", "203.0.113.20", [
				{ token: "previous", ipAddress: "203.0.113.10" },
			]),
		).toBe(true);
	});

	it("does not alert when another active session already used the IP address", () => {
		expect(
			isNewSignInIPAddress("current", "203.0.113.10", [
				{ token: "previous", ipAddress: "203.0.113.10" },
				{ token: "current", ipAddress: "203.0.113.10" },
			]),
		).toBe(false);
	});

	it("ignores the current session when comparing known IP addresses", () => {
		expect(
			isNewSignInIPAddress("current", "203.0.113.10", [
				{ token: "current", ipAddress: "203.0.113.10" },
			]),
		).toBe(true);
	});

	it("skips the alert when the sign-in IP address is unavailable", () => {
		expect(
			isNewSignInIPAddress("current", null, [
				{ token: "previous", ipAddress: "203.0.113.10" },
			]),
		).toBe(false);
	});

	it("normalizes whitespace and IPv6 casing before comparing", () => {
		expect(
			isNewSignInIPAddress("current", "  2001:DB8::1  ", [
				{ token: "previous", ipAddress: "2001:db8::1" },
			]),
		).toBe(false);
	});
});
