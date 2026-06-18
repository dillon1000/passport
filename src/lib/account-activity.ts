/**
 * Account activity taxonomy. Inputs are Better Auth endpoint paths and sign-in
 * events observed in the auth after-hook; outputs are stable machine event
 * types, human labels, and the read DTO surfaced on the user's Security page.
 *
 * This is the single source of truth for user-visible security events. The
 * email-alert path (security alert subject lines) and the persisted activity
 * log both derive their wording from ACCOUNT_ACTIVITY_LABELS so the two surfaces
 * never drift. Keep the `type` slugs stable: plan 017 (outbound webhooks) reuses
 * the same strings so one identity event is named identically everywhere.
 *
 * Privacy: only the event type and the request metadata already captured for
 * sessions (IP, coarse location, user agent) are ever stored. No secrets, OTP
 * codes, tokens, or password material belong in this log.
 */
import type { RequestLocation } from "./request-location";

export const ACCOUNT_ACTIVITY_TYPES = {
	SIGN_IN: "sign_in",
	EMAIL_CHANGE_REQUESTED: "email_change_requested",
	PASSWORD_CHANGED: "password_changed",
	PASSWORD_SET: "password_set",
	ACCOUNT_LINKED: "account_linked",
	ACCOUNT_UNLINKED: "account_unlinked",
	PASSKEY_ADDED: "passkey_added",
	PASSKEY_REMOVED: "passkey_removed",
	PHONE_ADDED: "phone_added",
	PHONE_REMOVED: "phone_removed",
	TWO_FACTOR_SETUP_STARTED: "two_factor_setup_started",
	TWO_FACTOR_ENABLED: "two_factor_enabled",
	TWO_FACTOR_DISABLED: "two_factor_disabled",
	BACKUP_CODES_REGENERATED: "backup_codes_regenerated",
} as const;

export type AccountActivityType =
	(typeof ACCOUNT_ACTIVITY_TYPES)[keyof typeof ACCOUNT_ACTIVITY_TYPES];

/**
 * Human labels. The values for the credential/MFA/passkey events intentionally
 * match the strings previously hard-coded in `securityEventForPath` so security
 * alert emails keep their exact subject wording.
 */
export const ACCOUNT_ACTIVITY_LABELS: Record<AccountActivityType, string> = {
	sign_in: "Signed in",
	email_change_requested: "Email change requested",
	password_changed: "Password changed",
	password_set: "Password set",
	account_linked: "Social account linked",
	account_unlinked: "Social account unlinked",
	passkey_added: "Passkey added",
	passkey_removed: "Passkey removed",
	phone_added: "Phone number added",
	phone_removed: "Phone number removed",
	two_factor_setup_started: "Two-factor authentication setup started",
	two_factor_enabled: "Two-factor authentication enabled",
	two_factor_disabled: "Two-factor authentication disabled",
	backup_codes_regenerated: "Two-factor backup codes regenerated",
};

/**
 * Maps a Better Auth API path to its activity type. Mirrors the set of paths
 * the security-alert hook reacts to. Body-derived events (phone removal) and
 * dynamic events (account linking, sign-in) are recorded directly by the hook
 * and are not path-based, so they are not resolved here.
 */
const PATH_TO_ACTIVITY_TYPE: Record<string, AccountActivityType> = {
	"/change-email": ACCOUNT_ACTIVITY_TYPES.EMAIL_CHANGE_REQUESTED,
	"/change-password": ACCOUNT_ACTIVITY_TYPES.PASSWORD_CHANGED,
	"/set-password": ACCOUNT_ACTIVITY_TYPES.PASSWORD_SET,
	"/unlink-account": ACCOUNT_ACTIVITY_TYPES.ACCOUNT_UNLINKED,
	"/passkey/verify-registration": ACCOUNT_ACTIVITY_TYPES.PASSKEY_ADDED,
	"/passkey/delete-passkey": ACCOUNT_ACTIVITY_TYPES.PASSKEY_REMOVED,
	"/phone-number/verify": ACCOUNT_ACTIVITY_TYPES.PHONE_ADDED,
	"/two-factor/enable": ACCOUNT_ACTIVITY_TYPES.TWO_FACTOR_SETUP_STARTED,
	"/two-factor/verify-totp": ACCOUNT_ACTIVITY_TYPES.TWO_FACTOR_ENABLED,
	"/two-factor/disable": ACCOUNT_ACTIVITY_TYPES.TWO_FACTOR_DISABLED,
	"/two-factor/generate-backup-codes": ACCOUNT_ACTIVITY_TYPES.BACKUP_CODES_REGENERATED,
};

export function accountActivityTypeForPath(
	path: string | null | undefined,
): AccountActivityType | null {
	if (!path) return null;
	return PATH_TO_ACTIVITY_TYPE[path] ?? null;
}

export function accountActivityLabel(type: string): string {
	return (
		ACCOUNT_ACTIVITY_LABELS[type as AccountActivityType] ??
		type
			.split("_")
			.map((part) => part.replace(/^\w/, (char) => char.toUpperCase()))
			.join(" ")
	);
}

/** Read DTO for the user-facing activity feed. */
export type AccountActivitySummary = {
	id: string;
	type: string;
	createdAt: string;
	ipAddress?: string | null;
	location?: RequestLocation | null;
	userAgent?: string | null;
};
