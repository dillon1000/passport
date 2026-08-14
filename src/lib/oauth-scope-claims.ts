/**
 * OAuth scope claim builder. Inputs are granted OAuth scopes, the authenticated
 * Better Auth user, and Passport membership data; outputs are standard and
 * namespaced OIDC claims for ID tokens, access tokens, and `/oauth2/userinfo`.
 * Safe configuration point: claim namespaces derive from `BETTER_AUTH_URL`.
 */
import { and, eq, inArray, ne } from "drizzle-orm";

import * as schema from "../db/schema";
import type { createDb } from "../db/client";
import type { AuthEnv } from "../env";
import { isAdminOperator } from "./admin-access";
import { billingPlanCatalog, type BillingPlanCatalog } from "./billing";
import { loadBillingPlans } from "./billing-plan-store";
import {
	buildBillingScopeClaims,
	type BillingPurchaseClaimSource,
	type BillingSubscriptionClaimSource,
} from "./billing-claims";
import { buildOAuthPolicyClaims } from "./oauth-policy";

type ClaimEnv = Pick<AuthEnv, "BETTER_AUTH_URL"> &
	Partial<Pick<AuthEnv, "ADMIN_EMAILS" | "ADMIN_USER_IDS">>;
type ClaimContextEnv = Pick<AuthEnv, "STRIPE_BILLING_PLANS">;
type OAuthClaimDatabase = ReturnType<typeof createDb>;

export type OAuthClaimUser = {
	id: string;
	email?: string | null;
	role?: string | null;
	image?: string | null;
	username?: string | null;
	displayUsername?: string | null;
	phoneNumber?: string | null;
	phoneNumberVerified?: boolean | null;
	twoFactorEnabled?: boolean | null;
	lastLoginMethod?: string | null;
};

/**
 * Authentication-context (LoA) identifiers emitted as the OIDC `acr` claim.
 * Higher assurance first. These are Passport-namespaced URNs so relying parties
 * can require a minimum assurance via the standard `acr_values` request
 * parameter (which `@better-auth/oauth-provider` already parses and enforces
 * through `prompt`/`max_age`). The values are ordered weakest-to-strongest in
 * PASSPORT_ACR_VALUES for discovery metadata.
 */
export const ACR_PASSWORD = "urn:passport:loa:pwd";
export const ACR_PASSKEY = "urn:passport:loa:passkey";
export const ACR_MFA = "urn:passport:loa:mfa";

export const PASSPORT_ACR_VALUES = [ACR_PASSWORD, ACR_PASSKEY, ACR_MFA] as const;

export type OrganizationMembershipClaim = {
	id: string;
	name: string;
	slug: string;
	logo?: string | null;
	role: string;
};

export type TeamMembershipClaim = {
	id: string;
	name: string;
	organizationId: string;
	organizationName: string;
	organizationSlug: string;
};

export type OAuthPolicyClaims = {
	roles: string[];
	permissions: string[];
	entitlements: string[];
};

export type OAuthSecurityClaimContext = {
	passkeyEnabled: boolean;
};

export type ConnectionClaim = {
	provider: string;
	accountId: string;
	scopes?: string[];
	connectedAt?: string;
	updatedAt?: string;
};

export type OAuthClaimContext = {
	organizations: OrganizationMembershipClaim[];
	teams: TeamMembershipClaim[];
	policy: OAuthPolicyClaims;
	security: OAuthSecurityClaimContext;
	connections: ConnectionClaim[];
	billingSubscriptions: BillingSubscriptionClaimSource[];
	billingPurchases: BillingPurchaseClaimSource[];
	billingCatalog: BillingPlanCatalog;
};

function hasScope(scopes: readonly string[], scope: string) {
	return scopes.includes(scope);
}

function unique(values: readonly string[]) {
	return [...new Set(values)];
}

function trimmed(value: string | null | undefined) {
	const normalized = value?.trim();
	return normalized || undefined;
}

function preferredUsername(user: OAuthClaimUser) {
	return trimmed(user.displayUsername) ?? trimmed(user.username);
}

function stringScopes(value: string | null | undefined) {
	return (
		value
			?.split(" ")
			.map((scope) => scope.trim())
			.filter(Boolean) ?? []
	);
}

function optionalISODate(value: Date | string | null | undefined) {
	if (!value) return undefined;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function oauthClaimURL(env: ClaimEnv, name: string) {
	return new URL(`/claims/${name}`, env.BETTER_AUTH_URL).toString();
}

export function oauthClaimsSupported(env: ClaimEnv) {
	return [
		"sub",
		"iss",
		"aud",
		"exp",
		"iat",
		"sid",
		"scope",
		"azp",
		"name",
		"email",
		"email_verified",
		"picture",
		"phone_number",
		"phone_number_verified",
		"preferred_username",
		"auth_time",
		"acr",
		"amr",
		oauthClaimURL(env, "organizations"),
		oauthClaimURL(env, "teams"),
		oauthClaimURL(env, "organization_ids"),
		oauthClaimURL(env, "organization_roles"),
		oauthClaimURL(env, "team_ids"),
		oauthClaimURL(env, "roles"),
		oauthClaimURL(env, "permissions"),
		oauthClaimURL(env, "entitlements"),
		oauthClaimURL(env, "platform_admin"),
		oauthClaimURL(env, "mfa_enabled"),
		oauthClaimURL(env, "passkey_enabled"),
		oauthClaimURL(env, "connections"),
		oauthClaimURL(env, "billing_status"),
		oauthClaimURL(env, "billing_subscriptions"),
		oauthClaimURL(env, "billing_purchases"),
		oauthClaimURL(env, "billing_entitlements"),
		oauthClaimURL(env, "billing_limits"),
	];
}

export function absoluteProfileImageURL(
	env: ClaimEnv,
	image: string | null | undefined,
) {
	if (!image) return undefined;
	if (image.startsWith("http://") || image.startsWith("https://")) return image;
	return new URL(image, env.BETTER_AUTH_URL).toString();
}

function pictureClaim(env: ClaimEnv, user: OAuthClaimUser, scopes: readonly string[]) {
	if (!hasScope(scopes, "profile") && !hasScope(scopes, "profile:picture")) {
		return {};
	}

	const picture = absoluteProfileImageURL(env, user.image);
	return picture ? { picture } : {};
}

function usernameClaim(user: OAuthClaimUser, scopes: readonly string[]) {
	if (!hasScope(scopes, "profile:username")) return {};

	const username = preferredUsername(user);
	return username ? { preferred_username: username } : {};
}

function phoneClaim(user: OAuthClaimUser, scopes: readonly string[]) {
	if (!hasScope(scopes, "phone")) return {};

	const phoneNumber = trimmed(user.phoneNumber);
	return phoneNumber
		? {
				phone_number: phoneNumber,
				phone_number_verified: user.phoneNumberVerified === true,
			}
		: {};
}

function compactMembershipClaims(
	env: ClaimEnv,
	scopes: readonly string[],
	context: OAuthClaimContext,
) {
	const includeOrganizationIds =
		hasScope(scopes, "organizations") || hasScope(scopes, "organizations:ids");
	const includeTeamOrganizationIds = hasScope(scopes, "teams");
	const includeOrganizationRoles =
		hasScope(scopes, "organizations") || hasScope(scopes, "organizations:roles");
	const includeTeamIds = hasScope(scopes, "teams") || hasScope(scopes, "teams:ids");
	const organizationIds = unique([
		...(includeOrganizationIds
			? context.organizations.map((organization) => organization.id)
			: []),
		...(includeTeamOrganizationIds
			? context.teams.map((team) => team.organizationId)
			: []),
	]);
	const teamIds = includeTeamIds ? unique(context.teams.map((team) => team.id)) : [];

	return {
		...(organizationIds.length
			? { [oauthClaimURL(env, "organization_ids")]: organizationIds }
			: {}),
		...(includeOrganizationRoles
			? {
					[oauthClaimURL(env, "organization_roles")]: Object.fromEntries(
						context.organizations.map((organization) => [
							organization.id,
							organization.role,
						]),
					),
				}
			: {}),
		...(teamIds.length ? { [oauthClaimURL(env, "team_ids")]: teamIds } : {}),
	};
}

function policyClaims(env: ClaimEnv, scopes: readonly string[], context: OAuthClaimContext) {
	if (!hasScope(scopes, "permissions")) return {};

	return {
		[oauthClaimURL(env, "roles")]: context.policy.roles,
		[oauthClaimURL(env, "permissions")]: context.policy.permissions,
		[oauthClaimURL(env, "entitlements")]: context.policy.entitlements,
	};
}

/** Returns platform-administrator status only after the client requests its dedicated scope. */
function platformAdminClaim(env: ClaimEnv, user: OAuthClaimUser, scopes: readonly string[]) {
	if (!hasScope(scopes, "platform:admin")) return {};

	return {
		[oauthClaimURL(env, "platform_admin")]: isAdminOperator(env, user),
	};
}

function accountSecurityClaims(
	env: ClaimEnv,
	user: OAuthClaimUser,
	scopes: readonly string[],
	context: OAuthClaimContext,
) {
	if (!hasScope(scopes, "account:security")) return {};

	return {
		[oauthClaimURL(env, "mfa_enabled")]: user.twoFactorEnabled === true,
		[oauthClaimURL(env, "passkey_enabled")]: context.security.passkeyEnabled,
	};
}

function connectionClaims(env: ClaimEnv, scopes: readonly string[], context: OAuthClaimContext) {
	if (!hasScope(scopes, "connections")) return {};

	return {
		[oauthClaimURL(env, "connections")]: context.connections,
	};
}

function billingClaims(env: ClaimEnv, scopes: readonly string[], context: OAuthClaimContext) {
	return buildBillingScopeClaims(
		env,
		scopes,
		context.billingSubscriptions,
		context.billingCatalog,
		context.billingPurchases,
	);
}

/**
 * Authentication-context claims for the ID token. Inputs are the authenticated
 * user (the plugin already supplies the session-accurate `auth_time` and `sid`
 * claims; this only fills the assurance level). Outputs are the standard OIDC
 * `acr` and `amr` claims.
 *
 * Truthfulness: Better Auth enforces the second factor at sign-in whenever a
 * user has 2FA enabled, so `twoFactorEnabled === true` means the session that
 * minted this token was MFA-backed — not merely MFA-capable. `amr` is derived
 * from `user.lastLoginMethod`, the method recorded at the most recent sign-in
 * (the sign-in that created the session). Federated/magic-link sign-ins have no
 * unambiguous RFC 8176 token, so only clearly-mapped methods contribute.
 */
export function buildAuthContextClaims(user: OAuthClaimUser): {
	acr: string;
	amr?: string[];
} {
	const method = user.lastLoginMethod?.trim().toLowerCase();
	const mfa = user.twoFactorEnabled === true;
	const amr: string[] = [];

	if (method === "passkey") {
		amr.push("swk"); // proof-of-possession of a software-secured key (WebAuthn)
	} else if (method === "email" || method === "credential" || method === "email-password") {
		amr.push("pwd");
	}
	if (mfa) {
		amr.push("mfa", "otp");
	}

	const acr = mfa ? ACR_MFA : method === "passkey" ? ACR_PASSKEY : ACR_PASSWORD;

	return amr.length ? { acr, amr } : { acr };
}

export function buildIDTokenScopeClaims(
	env: ClaimEnv,
	user: OAuthClaimUser,
	scopes: readonly string[],
): Record<string, unknown> {
	return {
		...buildAuthContextClaims(user),
		...pictureClaim(env, user, scopes),
		...usernameClaim(user, scopes),
		...phoneClaim(user, scopes),
		...platformAdminClaim(env, user, scopes),
	};
}

export function buildUserInfoScopeClaims(
	env: ClaimEnv,
	user: OAuthClaimUser,
	scopes: readonly string[],
	context: OAuthClaimContext,
): Record<string, unknown> {
	return {
		...pictureClaim(env, user, scopes),
		...usernameClaim(user, scopes),
		...phoneClaim(user, scopes),
		...(hasScope(scopes, "organizations")
			? { [oauthClaimURL(env, "organizations")]: context.organizations }
			: {}),
		...(hasScope(scopes, "teams") ? { [oauthClaimURL(env, "teams")]: context.teams } : {}),
		...compactMembershipClaims(env, scopes, context),
		...policyClaims(env, scopes, context),
		...platformAdminClaim(env, user, scopes),
		...accountSecurityClaims(env, user, scopes, context),
		...connectionClaims(env, scopes, context),
		...billingClaims(env, scopes, context),
	};
}

export function buildAccessTokenScopeClaims(
	env: ClaimEnv,
	user: OAuthClaimUser | null | undefined,
	scopes: readonly string[],
	context: OAuthClaimContext,
): Record<string, unknown> {
	if (!user) return {};

	return {
		...compactMembershipClaims(env, scopes, context),
		...policyClaims(env, scopes, context),
		...platformAdminClaim(env, user, scopes),
		...accountSecurityClaims(env, user, scopes, context),
		...billingClaims(env, scopes, context),
	};
}

export async function loadOAuthClaimContext(
	env: ClaimContextEnv,
	db: OAuthClaimDatabase,
	userId: string,
): Promise<OAuthClaimContext> {
	const billingCatalog_ = billingPlanCatalog(await loadBillingPlans(env, db));
	const organizations = await db
		.select({
			id: schema.organization.id,
			name: schema.organization.name,
			slug: schema.organization.slug,
			logo: schema.organization.logo,
			role: schema.member.role,
		})
		.from(schema.member)
		.innerJoin(
			schema.organization,
			eq(schema.member.organizationId, schema.organization.id),
		)
		.where(eq(schema.member.userId, userId));

	const teams = await db
		.select({
			id: schema.team.id,
			name: schema.team.name,
			organizationId: schema.organization.id,
			organizationName: schema.organization.name,
			organizationSlug: schema.organization.slug,
		})
		.from(schema.teamMember)
		.innerJoin(schema.team, eq(schema.teamMember.teamId, schema.team.id))
		.innerJoin(
			schema.organization,
			eq(schema.team.organizationId, schema.organization.id),
		)
		.where(eq(schema.teamMember.userId, userId));

	const organizationIds = organizations.map((organization) => organization.id);
	const rolePermissions = organizationIds.length
		? await db
				.select({
					organizationId: schema.organizationRole.organizationId,
					role: schema.organizationRole.role,
					permission: schema.organizationRole.permission,
				})
				.from(schema.organizationRole)
				.where(inArray(schema.organizationRole.organizationId, organizationIds))
		: [];

	const passkeys = await db
		.select({
			id: schema.passkey.id,
		})
		.from(schema.passkey)
		.where(eq(schema.passkey.userId, userId))
		.limit(1);

	const connections = await db
		.select({
			provider: schema.account.providerId,
			accountId: schema.account.accountId,
			scope: schema.account.scope,
			createdAt: schema.account.createdAt,
			updatedAt: schema.account.updatedAt,
		})
		.from(schema.account)
		.where(
			and(
				eq(schema.account.userId, userId),
				ne(schema.account.providerId, "credential"),
			),
		);

	const subscriptionReferenceIds = unique([userId, ...organizationIds]);
	const billingSubscriptions = subscriptionReferenceIds.length
		? await db
				.select({
					id: schema.subscription.id,
					referenceId: schema.subscription.referenceId,
					plan: schema.subscription.plan,
					status: schema.subscription.status,
					periodStart: schema.subscription.periodStart,
					periodEnd: schema.subscription.periodEnd,
					trialStart: schema.subscription.trialStart,
					trialEnd: schema.subscription.trialEnd,
					cancelAtPeriodEnd: schema.subscription.cancelAtPeriodEnd,
					cancelAt: schema.subscription.cancelAt,
					canceledAt: schema.subscription.canceledAt,
					endedAt: schema.subscription.endedAt,
					seats: schema.subscription.seats,
					billingInterval: schema.subscription.billingInterval,
					stripeScheduleId: schema.subscription.stripeScheduleId,
				})
				.from(schema.subscription)
				.where(inArray(schema.subscription.referenceId, subscriptionReferenceIds))
		: [];

	const billingPurchases = subscriptionReferenceIds.length
		? await db
				.select({
					id: schema.oneTimePurchase.id,
					referenceId: schema.oneTimePurchase.referenceId,
					plan: schema.oneTimePurchase.plan,
					status: schema.oneTimePurchase.status,
					quantity: schema.oneTimePurchase.quantity,
					amountTotal: schema.oneTimePurchase.amountTotal,
					currency: schema.oneTimePurchase.currency,
					purchasedAt: schema.oneTimePurchase.purchasedAt,
				})
				.from(schema.oneTimePurchase)
				.where(inArray(schema.oneTimePurchase.referenceId, subscriptionReferenceIds))
		: [];

	return {
		organizations,
		teams,
		policy: buildOAuthPolicyClaims({ memberships: organizations, rolePermissions }),
		security: {
			passkeyEnabled: passkeys.length > 0,
		},
		connections: connections.map((connection) => {
			const scopes = stringScopes(connection.scope);
			const connectedAt = optionalISODate(connection.createdAt);
			const updatedAt = optionalISODate(connection.updatedAt);

			return {
				provider: connection.provider,
				accountId: connection.accountId,
				...(scopes.length ? { scopes } : {}),
				...(connectedAt ? { connectedAt } : {}),
				...(updatedAt ? { updatedAt } : {}),
			};
		}),
		billingSubscriptions: billingSubscriptions.map((subscription) => ({
			...subscription,
			customerType:
				subscription.referenceId === userId ? "user" : "organization",
		})),
		billingPurchases: billingPurchases.map((purchase) => ({
			...purchase,
			customerType: purchase.referenceId === userId ? "user" : "organization",
		})),
		billingCatalog: billingCatalog_,
	};
}
