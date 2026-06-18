/**
 * Captcha-protected Better Auth endpoints. These paths are Better Auth route
 * paths under `/api/auth`; the captcha plugin receives them without the base
 * path and enforces Turnstile on matching POST requests.
 */
export const CAPTCHA_ENDPOINTS = [
	"/sign-up/email",
	"/sign-in/email",
	"/sign-in/username",
	"/request-password-reset",
	"/sign-in/magic-link",
	"/sign-in/social",
	"/passkey/verify-authentication",
] as const;
