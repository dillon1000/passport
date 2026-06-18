/**
 * Central OAuth scope registry. Inputs are scope strings from OAuth requests,
 * dynamic client registration, seeded clients, and admin UI forms; outputs are
 * validated scope lists plus copy that consent screens and docs can reuse.
 * Add future scopes here first so provider metadata, validation, and UI copy
 * stay aligned.
 */
export const STANDARD_OAUTH_SCOPES = [
	"openid",
	"profile",
	"email",
	"phone",
	"offline_access",
] as const;

export const PASSPORT_CUSTOM_OAUTH_SCOPES = [
	"profile:picture",
	"profile:username",
	"organizations",
	"organizations:ids",
	"organizations:roles",
	"teams",
	"teams:ids",
	"permissions",
	"account:security",
	"connections",
] as const;

export const SUPPORTED_OAUTH_SCOPES = [
	...STANDARD_OAUTH_SCOPES,
	...PASSPORT_CUSTOM_OAUTH_SCOPES,
] as const;

export const DEFAULT_CLIENT_REGISTRATION_SCOPES = [
	"openid",
	"profile",
	"email",
] as const;

export const CLIENT_REGISTRATION_ALLOWED_SCOPES = [
	"phone",
	"offline_access",
	"profile:picture",
	"profile:username",
	"organizations",
	"organizations:ids",
	"organizations:roles",
	"teams",
	"teams:ids",
	"permissions",
	"account:security",
	"connections",
] as const;

export type SupportedOAuthScope = (typeof SUPPORTED_OAUTH_SCOPES)[number];

export type OAuthScopeDefinition = {
	scope: SupportedOAuthScope;
	label: string;
	description: string;
	consent: string;
	category: "identity" | "account" | "organization";
};

export const OAUTH_SCOPE_DEFINITIONS: Record<SupportedOAuthScope, OAuthScopeDefinition> = {
	openid: {
		scope: "openid",
		label: "Identity",
		description: "Verifies the signed-in user's stable subject identifier.",
		consent: "Verify your identity",
		category: "identity",
	},
	profile: {
		scope: "profile",
		label: "Profile",
		description: "Reads standard profile details such as name and picture.",
		consent: "Read your name and profile details",
		category: "identity",
	},
	email: {
		scope: "email",
		label: "Email",
		description: "Reads the user's email address and verification state.",
		consent: "Read your email address",
		category: "identity",
	},
	phone: {
		scope: "phone",
		label: "Phone",
		description: "Reads the user's phone number and verification state.",
		consent: "Read your phone number",
		category: "identity",
	},
	offline_access: {
		scope: "offline_access",
		label: "Offline access",
		description: "Allows the client to refresh tokens while the user is away.",
		consent: "Stay signed in when you're away",
		category: "account",
	},
	"profile:picture": {
		scope: "profile:picture",
		label: "Profile picture",
		description: "Reads only the user's profile picture URL.",
		consent: "Read your profile picture",
		category: "identity",
	},
	"profile:username": {
		scope: "profile:username",
		label: "Username",
		description: "Reads only the user's preferred username.",
		consent: "Read your username",
		category: "identity",
	},
	organizations: {
		scope: "organizations",
		label: "Organizations",
		description: "Reads organization memberships and roles.",
		consent: "Read your organization memberships",
		category: "organization",
	},
	"organizations:ids": {
		scope: "organizations:ids",
		label: "Organization IDs",
		description: "Reads only organization IDs for memberships.",
		consent: "Read your organization IDs",
		category: "organization",
	},
	"organizations:roles": {
		scope: "organizations:roles",
		label: "Organization roles",
		description: "Reads organization IDs and the user's role in each organization.",
		consent: "Read your organization roles",
		category: "organization",
	},
	teams: {
		scope: "teams",
		label: "Teams",
		description: "Reads team memberships inside organizations.",
		consent: "Read your team memberships",
		category: "organization",
	},
	"teams:ids": {
		scope: "teams:ids",
		label: "Team IDs",
		description: "Reads only team IDs for memberships.",
		consent: "Read your team IDs",
		category: "organization",
	},
	permissions: {
		scope: "permissions",
		label: "Permissions",
		description: "Reads computed roles, permissions, and entitlements.",
		consent: "Read your app permissions",
		category: "account",
	},
	"account:security": {
		scope: "account:security",
		label: "Account security",
		description: "Reads minimal security enrollment state for the user's account.",
		consent: "Read your account security state",
		category: "account",
	},
	connections: {
		scope: "connections",
		label: "Connections",
		description: "Reads connected social provider account metadata.",
		consent: "Read your connected accounts",
		category: "account",
	},
};

const supportedScopeSet = new Set<string>(SUPPORTED_OAUTH_SCOPES);

export function isSupportedOAuthScope(value: string): value is SupportedOAuthScope {
	return supportedScopeSet.has(value);
}

export function unsupportedOAuthScopes(scopes: readonly string[]) {
	return scopes.filter((scope) => !isSupportedOAuthScope(scope));
}

export function unsupportedOAuthScopesMessage(scopes: readonly string[]) {
	const unsupported = unsupportedOAuthScopes(scopes);
	if (unsupported.length === 0) return undefined;
	return `Unsupported OAuth scope${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}`;
}

export function assertSupportedOAuthScopes(scopes: readonly string[], source: string) {
	const unsupported = unsupportedOAuthScopes(scopes);
	if (unsupported.length === 0) return;
	throw new TypeError(
		`Unsupported OAuth scope${unsupported.length === 1 ? "" : "s"} in ${source}: ${unsupported.join(", ")}`,
	);
}

export function defaultClientScopeString() {
	return DEFAULT_CLIENT_REGISTRATION_SCOPES.join(" ");
}

export function supportedScopeString() {
	return SUPPORTED_OAUTH_SCOPES.join(" ");
}
