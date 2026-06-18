/**
 * Static Better Auth options shared by the runtime factory and tests. These
 * constants define cookie naming, trusted IP headers, and session persistence;
 * safe configuration points are the cookie prefix/name and header allow-list.
 */
import type { BetterAuthOptions } from "better-auth/minimal";

export const AUTH_SESSION_COOKIE_NAME = "passport_session";

export const AUTH_ADVANCED_OPTIONS = {
	cookiePrefix: "passport",
	cookies: {
		session_token: {
			name: AUTH_SESSION_COOKIE_NAME,
		},
	},
	ipAddress: {
		ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
	},
} satisfies BetterAuthOptions["advanced"];

export const AUTH_SESSION_OPTIONS = {
	storeSessionInDatabase: true,
	additionalFields: {
		location: {
			type: "json",
			required: false,
			input: false,
		},
	},
} satisfies BetterAuthOptions["session"];
