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
	"profile:write",
	"organizations",
	"organizations:ids",
	"organizations:roles",
	"organizations:write",
	"organization-invitations:read",
	"organization-invitations:write",
	"organization-members:read",
	"organization-members:write",
	"teams",
	"teams:ids",
	"teams:write",
	"team-members:read",
	"team-members:write",
	"permissions",
	"account:security",
	"connections",
	"billing:status",
	"billing:subscriptions",
	"billing:purchases",
	"billing:entitlements",
	"billing:limits",
	"billing:checkout",
	"billing:manage",
] as const;

export const DELEGATED_CLIENT_API_SCOPES = [
	"profile:write",
	"organizations",
	"organizations:write",
	"organization-invitations:read",
	"organization-invitations:write",
	"organization-members:read",
	"organization-members:write",
	"teams",
	"teams:write",
	"team-members:read",
	"team-members:write",
	"billing:subscriptions",
	"billing:purchases",
	"billing:checkout",
	"billing:manage",
] as const satisfies readonly (typeof PASSPORT_CUSTOM_OAUTH_SCOPES)[number][];

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
	"profile:write",
	"organizations",
	"organizations:ids",
	"organizations:roles",
	"organizations:write",
	"organization-invitations:read",
	"organization-invitations:write",
	"organization-members:read",
	"organization-members:write",
	"teams",
	"teams:ids",
	"teams:write",
	"team-members:read",
	"team-members:write",
	"permissions",
	"account:security",
	"connections",
	"billing:status",
	"billing:subscriptions",
	"billing:purchases",
	"billing:entitlements",
	"billing:limits",
	"billing:checkout",
	"billing:manage",
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
	"profile:write": {
		scope: "profile:write",
		label: "Edit profile",
		description: "Updates the user's name or username and manages their profile picture.",
		consent: "Edit your profile and profile picture",
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
	"organizations:write": {
		scope: "organizations:write",
		label: "Manage organizations",
		description: "Creates, updates, leaves, or deletes organizations and manages their logos.",
		consent: "Create and manage your organizations",
		category: "organization",
	},
	"organization-invitations:read": {
		scope: "organization-invitations:read",
		label: "Organization invitations",
		description: "Reads invitations sent to the user or within organizations they can access.",
		consent: "Read your organization invitations",
		category: "organization",
	},
	"organization-invitations:write": {
		scope: "organization-invitations:write",
		label: "Manage organization invitations",
		description: "Sends, cancels, accepts, or rejects organization invitations.",
		consent: "Send and respond to organization invitations",
		category: "organization",
	},
	"organization-members:read": {
		scope: "organization-members:read",
		label: "Organization members",
		description: "Reads members of organizations the user can access.",
		consent: "Read members of your organizations",
		category: "organization",
	},
	"organization-members:write": {
		scope: "organization-members:write",
		label: "Manage organization members",
		description: "Changes organization member roles or removes members.",
		consent: "Manage members of your organizations",
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
	"teams:write": {
		scope: "teams:write",
		label: "Manage teams",
		description: "Creates, updates, deletes, and brands teams.",
		consent: "Create and manage teams in your organizations",
		category: "organization",
	},
	"team-members:read": {
		scope: "team-members:read",
		label: "Team members",
		description: "Reads team membership inside organizations the user can access.",
		consent: "Read members of your teams",
		category: "organization",
	},
	"team-members:write": {
		scope: "team-members:write",
		label: "Manage team members",
		description: "Adds or removes team members inside organizations the user can manage.",
		consent: "Manage members of your teams",
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
	"billing:status": {
		scope: "billing:status",
		label: "Billing status",
		description: "Reads whether the user or their organizations have active billing.",
		consent: "Read your billing status",
		category: "account",
	},
	"billing:subscriptions": {
		scope: "billing:subscriptions",
		label: "Billing subscriptions",
		description:
			"Reads product-level subscription details without raw Stripe identifiers.",
		consent: "Read your subscription details",
		category: "account",
	},
	"billing:purchases": {
		scope: "billing:purchases",
		label: "Billing purchases",
		description:
			"Reads product-level one-time purchase details without raw Stripe identifiers.",
		consent: "Read your one-time purchases",
		category: "account",
	},
	"billing:entitlements": {
		scope: "billing:entitlements",
		label: "Billing entitlements",
		description: "Reads feature entitlements derived from active billing plans.",
		consent: "Read your plan entitlements",
		category: "account",
	},
	"billing:limits": {
		scope: "billing:limits",
		label: "Billing limits",
		description: "Reads product limits derived from active billing plans.",
		consent: "Read your plan limits",
		category: "account",
	},
	"billing:checkout": {
		scope: "billing:checkout",
		label: "Start checkout",
		description: "Creates hosted Passport checkout actions for products.",
		consent: "Start checkout for Passport products",
		category: "account",
	},
	"billing:manage": {
		scope: "billing:manage",
		label: "Manage billing",
		description: "Creates hosted billing portal, cancellation, and restoration actions.",
		consent: "Manage your billing through Passport",
		category: "account",
	},
};

const supportedScopeSet = new Set<string>(SUPPORTED_OAUTH_SCOPES);

export function isSupportedOAuthScope(value: string): value is SupportedOAuthScope {
	return supportedScopeSet.has(value);
}

export function oauthScopeConsentText(scope: string) {
	return isSupportedOAuthScope(scope)
		? OAUTH_SCOPE_DEFINITIONS[scope].consent
		: "Review requested access";
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
