import { describe, expect, it } from "vitest";

import {
	ACR_MFA,
	ACR_PASSKEY,
	ACR_PASSWORD,
	absoluteProfileImageURL,
	buildAccessTokenScopeClaims,
	buildAuthContextClaims,
	buildIDTokenScopeClaims,
	buildUserInfoScopeClaims,
	oauthClaimURL,
	oauthClaimsSupported,
	type OAuthClaimContext,
} from "./oauth-scope-claims";
import { billingPlanCatalog, parseStripeBillingPlans } from "./billing";

const env = {
	BETTER_AUTH_URL: "https://passport.test",
};

const user = {
	id: "user_123",
	image: "/api/profile-images/profile-images/user_123/avatar.png",
	username: "dillon",
	displayUsername: "Dillon",
	phoneNumber: "+15555550123",
	phoneNumberVerified: true,
	twoFactorEnabled: true,
};

const context: OAuthClaimContext = {
	organizations: [
		{
			id: "org_123",
			name: "Acme",
			slug: "acme",
			logo: "/api/profile-images/profile-images/user_123/organization-logo/logo.webp",
			role: "owner",
		},
	],
	teams: [
		{
			id: "team_123",
			name: "Engineering",
			organizationId: "org_123",
			organizationName: "Acme",
			organizationSlug: "acme",
		},
	],
	policy: {
		roles: ["authenticated", "organization:org_123:owner"],
		permissions: ["organization:org_123:project:create"],
		entitlements: [],
	},
	security: {
		passkeyEnabled: true,
	},
	connections: [
		{
			provider: "github",
			accountId: "dillon1000",
			scopes: ["read:user", "user:email"],
			connectedAt: "2026-01-02T03:04:05.000Z",
			updatedAt: "2026-01-03T04:05:06.000Z",
		},
	],
	billingSubscriptions: [
		{
			id: "sub_row_123",
			referenceId: "user_123",
			customerType: "user",
			plan: "pro",
			status: "active",
			billingInterval: "month",
			seats: 1,
			periodStart: new Date("2026-01-01T00:00:00.000Z"),
			periodEnd: new Date("2026-02-01T00:00:00.000Z"),
			cancelAtPeriodEnd: false,
			stripeScheduleId: null,
		},
	],
	billingPurchases: [
		{
			id: "otp_row_123",
			referenceId: "user_123",
			customerType: "user",
			plan: "lifetime",
			status: "completed",
			quantity: 1,
			amountTotal: 9900,
			currency: "usd",
			purchasedAt: new Date("2026-01-05T00:00:00.000Z"),
		},
	],
	billingCatalog: billingPlanCatalog(
		parseStripeBillingPlans(
			JSON.stringify([
				{
					name: "pro",
					priceId: "price_pro_month",
					limits: { applications: 10 },
					entitlements: ["billing"],
				},
				{
					name: "lifetime",
					priceId: "price_lifetime",
					type: "one_time",
					limits: { applications: 50 },
					entitlements: ["lifetime_access"],
				},
			]),
		),
	),
};

describe("OAuth scope claims", () => {
	it("normalizes Passport-hosted profile image paths into absolute URLs", () => {
		expect(absoluteProfileImageURL(env, user.image)).toBe(
			"https://passport.test/api/profile-images/profile-images/user_123/avatar.png",
		);
		expect(absoluteProfileImageURL(env, "https://cdn.example.com/avatar.png")).toBe(
			"https://cdn.example.com/avatar.png",
		);
	});

	it("adds picture to ID tokens for the narrow profile picture scope", () => {
		// The fixture user has 2FA enabled, so every ID token also carries the
		// authentication-context claims (acr/amr) regardless of scope.
		expect(buildIDTokenScopeClaims(env, user, ["openid", "profile:picture"])).toEqual({
			acr: ACR_MFA,
			amr: ["mfa", "otp"],
			picture: "https://passport.test/api/profile-images/profile-images/user_123/avatar.png",
		});
	});

	it("adds standard phone and narrow username claims when consented", () => {
		expect(
			buildIDTokenScopeClaims(env, user, ["openid", "phone", "profile:username"]),
		).toEqual({
			acr: ACR_MFA,
			amr: ["mfa", "otp"],
			phone_number: "+15555550123",
			phone_number_verified: true,
			preferred_username: "Dillon",
		});
		expect(buildIDTokenScopeClaims(env, user, ["openid"])).toEqual({
			acr: ACR_MFA,
			amr: ["mfa", "otp"],
		});
	});

	it("adds detailed organization and team claims to userinfo only when scopes are granted", () => {
		const claims = buildUserInfoScopeClaims(env, user, ["organizations", "teams"], context);

		expect(claims[oauthClaimURL(env, "organizations")]).toEqual(context.organizations);
		expect(claims[oauthClaimURL(env, "teams")]).toEqual(context.teams);
		expect(buildUserInfoScopeClaims(env, user, ["openid"], context)).toEqual({});
	});

	it("adds privacy-preserving membership claims for narrow membership scopes", () => {
		expect(
			buildUserInfoScopeClaims(
				env,
				user,
				["organizations:ids", "organizations:roles", "teams:ids"],
				context,
			),
		).toEqual({
			[oauthClaimURL(env, "organization_ids")]: ["org_123"],
			[oauthClaimURL(env, "organization_roles")]: {
				org_123: "owner",
			},
			[oauthClaimURL(env, "team_ids")]: ["team_123"],
		});
	});

	it("does not infer team claims without assigned team memberships", () => {
		const noTeamContext = { ...context, teams: [] };

		expect(buildAccessTokenScopeClaims(env, user, ["teams", "teams:ids"], noTeamContext)).toEqual({});
		expect(buildUserInfoScopeClaims(env, user, ["teams"], noTeamContext)).toEqual({
			[oauthClaimURL(env, "teams")]: [],
		});
	});

	it("adds computed policy outputs without raw admin flags", () => {
		expect(buildAccessTokenScopeClaims(env, user, ["permissions"], context)).toEqual({
			[oauthClaimURL(env, "roles")]: ["authenticated", "organization:org_123:owner"],
			[oauthClaimURL(env, "permissions")]: ["organization:org_123:project:create"],
			[oauthClaimURL(env, "entitlements")]: [],
		});
		expect(buildAccessTokenScopeClaims(env, user, ["openid"], context)).toEqual({});
	});

	it("adds minimal account security claims when consented", () => {
		expect(buildUserInfoScopeClaims(env, user, ["account:security"], context)).toEqual({
			[oauthClaimURL(env, "mfa_enabled")]: true,
			[oauthClaimURL(env, "passkey_enabled")]: true,
		});
	});

	it("adds connected social account metadata without exposing provider tokens", () => {
		expect(buildUserInfoScopeClaims(env, user, ["connections"], context)).toEqual({
			[oauthClaimURL(env, "connections")]: context.connections,
		});
	});

	it("adds billing claims when billing scopes are granted", () => {
		expect(
			buildAccessTokenScopeClaims(
				env,
				user,
				["billing:status", "billing:entitlements", "billing:limits"],
				context,
			),
		).toEqual({
			// billing_status reflects subscriptions only; one-time purchases have no
			// active/trialing lifecycle so they do not appear here.
			[oauthClaimURL(env, "billing_status")]: {
				active: true,
				trialing: false,
				pastDue: false,
				canceled: false,
				activePlans: ["pro"],
				plans: ["pro"],
			},
			// Entitlements and limits merge active subscriptions with completed
			// one-time purchases (the "lifetime" purchase adds lifetime_access and
			// raises the applications limit from 10 to 50).
			[oauthClaimURL(env, "billing_entitlements")]: ["billing", "lifetime_access"],
			[oauthClaimURL(env, "billing_limits")]: { applications: 50 },
		});
		expect(
			buildUserInfoScopeClaims(env, user, ["billing:subscriptions"], context),
		).toEqual({
			[oauthClaimURL(env, "billing_subscriptions")]: [
				{
					id: "sub_row_123",
					referenceId: "user_123",
					customerType: "user",
					plan: "pro",
					status: "active",
					billingInterval: "month",
					seats: 1,
					periodStart: "2026-01-01T00:00:00.000Z",
					periodEnd: "2026-02-01T00:00:00.000Z",
					cancelAtPeriodEnd: false,
					scheduledChange: false,
					limits: { applications: 10 },
					entitlements: ["billing"],
				},
			],
		});
	});

	it("adds one-time purchase claims under the billing:purchases scope", () => {
		expect(
			buildUserInfoScopeClaims(env, user, ["billing:purchases"], context),
		).toEqual({
			[oauthClaimURL(env, "billing_purchases")]: [
				{
					id: "otp_row_123",
					referenceId: "user_123",
					customerType: "user",
					plan: "lifetime",
					status: "completed",
					quantity: 1,
					amountTotal: 9900,
					currency: "usd",
					purchasedAt: "2026-01-05T00:00:00.000Z",
					limits: { applications: 50 },
					entitlements: ["lifetime_access"],
				},
			],
		});
	});

	it("keeps access token claims compact", () => {
		expect(
			buildAccessTokenScopeClaims(
				env,
				user,
				["organizations", "organizations:roles", "teams"],
				context,
			),
		).toEqual({
			[oauthClaimURL(env, "organization_ids")]: ["org_123"],
			[oauthClaimURL(env, "organization_roles")]: {
				org_123: "owner",
			},
			[oauthClaimURL(env, "team_ids")]: ["team_123"],
		});
	});

	describe("authentication-context claims", () => {
		it("reports MFA assurance and methods when 2FA is enabled", () => {
			expect(
				buildAuthContextClaims({ id: "u", lastLoginMethod: "email", twoFactorEnabled: true }),
			).toEqual({ acr: ACR_MFA, amr: ["pwd", "mfa", "otp"] });
		});

		it("reports passkey assurance for a passkey sign-in without 2FA", () => {
			expect(
				buildAuthContextClaims({ id: "u", lastLoginMethod: "passkey", twoFactorEnabled: false }),
			).toEqual({ acr: ACR_PASSKEY, amr: ["swk"] });
		});

		it("reports password assurance for a credential sign-in", () => {
			expect(
				buildAuthContextClaims({ id: "u", lastLoginMethod: "email", twoFactorEnabled: false }),
			).toEqual({ acr: ACR_PASSWORD, amr: ["pwd"] });
		});

		it("omits amr for an unmapped method but still asserts the password floor", () => {
			expect(
				buildAuthContextClaims({ id: "u", lastLoginMethod: "github", twoFactorEnabled: false }),
			).toEqual({ acr: ACR_PASSWORD });
		});

		it("includes acr and amr in the ID token claims", () => {
			const claims = buildIDTokenScopeClaims(
				env,
				{ id: "u", lastLoginMethod: "passkey", twoFactorEnabled: true },
				["openid", "profile"],
			);
			expect(claims.acr).toBe(ACR_MFA);
			expect(claims.amr).toEqual(["swk", "mfa", "otp"]);
		});
	});

	it("advertises the namespaced Passport claims", () => {
		expect(oauthClaimsSupported(env)).toEqual(
			expect.arrayContaining([
				"picture",
				"phone_number",
				"phone_number_verified",
				"preferred_username",
				"auth_time",
				"acr",
				"amr",
				"https://passport.test/claims/organizations",
				"https://passport.test/claims/teams",
				"https://passport.test/claims/organization_ids",
				"https://passport.test/claims/organization_roles",
				"https://passport.test/claims/team_ids",
				"https://passport.test/claims/roles",
				"https://passport.test/claims/permissions",
				"https://passport.test/claims/entitlements",
				"https://passport.test/claims/mfa_enabled",
				"https://passport.test/claims/passkey_enabled",
				"https://passport.test/claims/connections",
				"https://passport.test/claims/billing_status",
				"https://passport.test/claims/billing_subscriptions",
				"https://passport.test/claims/billing_entitlements",
				"https://passport.test/claims/billing_limits",
			]),
		);
	});
});
