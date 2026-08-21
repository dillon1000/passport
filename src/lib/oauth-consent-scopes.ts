/**
 * Consent presentation policy. Inputs are requested and client-declared
 * optional OAuth scopes; outputs are ordered, plain-language capability groups.
 * Scopes are required unless the reviewed client explicitly marks them optional.
 */
import { OAUTH_SCOPE_DEFINITIONS, isSupportedOAuthScope } from "./oauth-scopes";

export type ConsentScopeGroup = {
	id: "write" | "identity" | "phone" | "organization" | "security" | "billing";
	title: string;
	description?: string;
	scopes: string[];
	visibleScopes: string[];
	optionalScopes: string[];
	requiredScopes: string[];
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
const IDENTITY_SCOPES = new Set([
	"openid",
	"profile",
	"email",
	"profile:picture",
	"profile:username",
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

export function isOptionalConsentScope(
	scope: string,
	optionalScopes: readonly string[] = [],
) {
	return optionalScopes.includes(scope);
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
	description: string | undefined,
	scopes: string[],
	optionalScopeSet: Set<string>,
): ConsentScopeGroup | null {
	if (scopes.length === 0) return null;
	return {
		id,
		title,
		description,
		scopes,
		visibleScopes: visibleScopes(scopes),
		optionalScopes: scopes.filter((scope) => optionalScopeSet.has(scope)),
		requiredScopes: scopes.filter((scope) => !optionalScopeSet.has(scope)),
	};
}

/** Groups requested access into the short capability rows shown on consent. */
export function consentScopeGroups(
	requestedScopes: readonly string[],
	optionalScopes: readonly string[] = [],
) {
	const scopes = [...new Set(requestedScopes)].filter((scope) => scope !== "offline_access");
	const optionalScopeSet = new Set(optionalScopes.filter((scope) => scopes.includes(scope)));
	const writes = scopes.filter((scope) => WRITE_SCOPES.has(scope));
	const identity = scopes.filter((scope) => IDENTITY_SCOPES.has(scope));
	const phone = scopes.filter((scope) => scope === "phone");
	const organizations = scopes.filter((scope) => ORGANIZATION_SCOPES.has(scope));
	const billing = scopes.filter((scope) => BILLING_SCOPES.has(scope));
	const assigned = new Set([...writes, ...identity, ...phone, ...organizations, ...billing]);
	const security = scopes.filter((scope) => !assigned.has(scope));

	return [
		group(
			"write",
			"Create, edit, and delete data",
			"Including data created before this connection",
			writes,
			optionalScopeSet,
		),
		group(
			"identity",
			"See who you are",
			"Name, email, username, picture",
			identity.sort((left, right) => (left === "openid" ? 1 : right === "openid" ? -1 : 0)),
			optionalScopeSet,
		),
		group("phone", "See your phone number", undefined, phone, optionalScopeSet),
		group(
			"organization",
			"See your orgs, teams, and roles",
			"Memberships and permissions, not contents",
			organizations,
			optionalScopeSet,
		),
		group(
			"security",
			"See your other connected apps and security setup",
			"Which apps you’ve linked, whether 2FA is on",
			security,
			optionalScopeSet,
		),
		group(
			"billing",
			"See your billing access",
			"Subscriptions, purchases, entitlements, and limits",
			billing,
			optionalScopeSet,
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
