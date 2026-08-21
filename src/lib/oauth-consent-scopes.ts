/**
 * Consent presentation policy. Inputs are requested OAuth scope strings;
 * outputs are ordered, plain-language capability groups and the scopes that a
 * user can omit. Grant decisions still send the original scope strings to the
 * OAuth provider, so this file changes presentation without changing claims.
 */
import {
	OAUTH_SCOPE_DEFINITIONS,
	isSupportedOAuthScope,
} from "./oauth-scopes";

export type ConsentScopeGroup = {
	id: "write" | "organization" | "account" | "billing";
	title: string;
	description: string;
	scopes: string[];
	visibleScopes: string[];
	optional: boolean;
};

const WRITE_SCOPES = new Set([
	"profile:write",
	"organizations:write",
	"organization-invitations:write",
	"organization-members:write",
	"teams:write",
	"team-members:write",
	"billing:checkout",
	"billing:manage",
]);
const ORGANIZATION_SCOPES = new Set([
	"organizations",
	"organizations:ids",
	"organizations:roles",
	"organization-invitations:read",
	"organization-members:read",
	"teams",
	"teams:ids",
	"team-members:read",
]);
const BILLING_SCOPES = new Set([
	"billing:status",
	"billing:subscriptions",
	"billing:purchases",
	"billing:entitlements",
	"billing:limits",
]);
const REQUIRED_IDENTITY_SCOPES = new Set(["openid", "profile", "email"]);

/** Baseline identity stays required; elevated and extended access can be omitted. */
export function isOptionalConsentScope(scope: string) {
	return !REQUIRED_IDENTITY_SCOPES.has(scope);
}

function visibleScopes(scopes: string[]) {
	const hidden = new Set<string>();
	if (scopes.includes("organizations")) hidden.add("organizations:ids");
	if (scopes.includes("teams")) hidden.add("teams:ids");
	if (scopes.includes("profile")) {
		hidden.add("profile:username");
		hidden.add("profile:picture");
	}
	return scopes.filter((scope) => !hidden.has(scope));
}

function group(
	id: ConsentScopeGroup["id"],
	title: string,
	description: string,
	scopes: string[],
): ConsentScopeGroup | null {
	if (scopes.length === 0) return null;
	return {
		id,
		title,
		description,
		scopes,
		visibleScopes: visibleScopes(scopes),
		optional: scopes.every(isOptionalConsentScope),
	};
}

/** Groups scopes by blast radius, with write access first and identity last. */
export function consentScopeGroups(requestedScopes: readonly string[]) {
	const scopes = [...new Set(requestedScopes)].filter((scope) => scope !== "offline_access");
	const writes = scopes.filter((scope) => WRITE_SCOPES.has(scope));
	const organizations = scopes.filter((scope) => ORGANIZATION_SCOPES.has(scope));
	const billing = scopes.filter((scope) => BILLING_SCOPES.has(scope));
	const assigned = new Set([...writes, ...organizations, ...billing]);
	const account = scopes.filter((scope) => !assigned.has(scope));

	return [
		group(
			"write",
			"Change data in your account",
			"This can change existing profile, organization, team, member, invitation, or billing data.",
			writes,
		),
		group(
			"organization",
			"See your organizations and teams",
			"This includes memberships, roles, invitations, and people in resources you can access.",
			organizations,
		),
		group(
			"billing",
			"See your billing access",
			"This includes subscriptions, purchases, entitlements, and product limits.",
			billing,
		),
		group(
			"account",
			"See your account and profile information",
			"This can include contact details, security setup, permissions, and connected accounts.",
			account.sort((left, right) => (left === "openid" ? 1 : right === "openid" ? -1 : 0)),
		),
	].filter((item): item is ConsentScopeGroup => item !== null);
}

export function consentScopeLabel(scope: string) {
	return isSupportedOAuthScope(scope)
		? OAUTH_SCOPE_DEFINITIONS[scope].consent
		: "Review developer-requested access";
}

/** Removes control characters and bidirectional overrides before display. */
export function safeOAuthClientName(value: string, fallback: string) {
	const cleaned = value
		.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
	return (cleaned || fallback).slice(0, 80);
}

export function oauthRedirectHost(value: string | null | undefined) {
	if (!value) return undefined;
	try {
		return new URL(value).hostname.toLowerCase();
	} catch {
		return undefined;
	}
}

export function isLocalOAuthHost(host: string | undefined) {
	return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
