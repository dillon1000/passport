import { describe, expect, it } from "vitest";

import { billingPlanCatalog, parseStripeBillingPlans } from "./billing";
import {
	buildBillingScopeClaims,
	type BillingPurchaseClaimSource,
	type BillingSubscriptionClaimSource,
} from "./billing-claims";
import { oauthClaimURL } from "./oauth-scope-claims";

const env = {
	BETTER_AUTH_URL: "https://passport.test",
};

const catalog = billingPlanCatalog(
	parseStripeBillingPlans(
		JSON.stringify([
			{
				name: "team",
				priceId: "price_team_month",
				limits: {
					members: 25,
					applications: 20,
				},
				entitlements: ["oauth", "billing", "organizations"],
			},
			{
				name: "lifetime",
				priceId: "price_lifetime",
				type: "one_time",
				limits: {
					applications: 100,
				},
				entitlements: ["lifetime_access"],
			},
		]),
	),
);

const purchases: BillingPurchaseClaimSource[] = [
	{
		id: "otp_row_123",
		referenceId: "org_123",
		customerType: "organization",
		plan: "lifetime",
		status: "completed",
		quantity: 1,
		amountTotal: 19900,
		currency: "usd",
		purchasedAt: new Date("2026-01-05T00:00:00.000Z"),
	},
];

const subscriptions: BillingSubscriptionClaimSource[] = [
	{
		id: "sub_row_123",
		referenceId: "org_123",
		customerType: "organization",
		plan: "team",
		status: "active",
		billingInterval: "month",
		seats: 7,
		periodStart: new Date("2026-01-01T00:00:00.000Z"),
		periodEnd: new Date("2026-02-01T00:00:00.000Z"),
		cancelAtPeriodEnd: false,
		stripeScheduleId: "sched_123",
	},
];

describe("billing scope claims", () => {
	it("emits billing status, subscriptions, entitlements, and limits without raw Stripe IDs", () => {
		const claims = buildBillingScopeClaims(
			env,
			[
				"billing:status",
				"billing:subscriptions",
				"billing:entitlements",
				"billing:limits",
			],
			subscriptions,
			catalog,
		);

		expect(claims).toEqual({
			[oauthClaimURL(env, "billing_status")]: {
				active: true,
				trialing: false,
				pastDue: false,
				canceled: false,
				activePlans: ["team"],
				plans: ["team"],
			},
			[oauthClaimURL(env, "billing_subscriptions")]: [
				{
					id: "sub_row_123",
					referenceId: "org_123",
					customerType: "organization",
					plan: "team",
					status: "active",
					billingInterval: "month",
					seats: 7,
					periodStart: "2026-01-01T00:00:00.000Z",
					periodEnd: "2026-02-01T00:00:00.000Z",
					cancelAtPeriodEnd: false,
					scheduledChange: true,
					limits: {
						members: 25,
						applications: 20,
					},
					entitlements: ["oauth", "billing", "organizations"],
				},
			],
			[oauthClaimURL(env, "billing_entitlements")]: [
				"oauth",
				"billing",
				"organizations",
			],
			[oauthClaimURL(env, "billing_limits")]: {
				members: 25,
				applications: 20,
			},
		});
		expect(JSON.stringify(claims)).not.toContain("stripe");
	});

	it("omits billing claims when billing scopes are not granted", () => {
		expect(buildBillingScopeClaims(env, ["openid"], subscriptions, catalog)).toEqual({});
	});

	it("emits one-time purchase claims under the billing:purchases scope", () => {
		const claims = buildBillingScopeClaims(
			env,
			["billing:purchases"],
			[],
			catalog,
			purchases,
		);

		expect(claims).toEqual({
			[oauthClaimURL(env, "billing_purchases")]: [
				{
					id: "otp_row_123",
					referenceId: "org_123",
					customerType: "organization",
					plan: "lifetime",
					status: "completed",
					quantity: 1,
					amountTotal: 19900,
					currency: "usd",
					purchasedAt: "2026-01-05T00:00:00.000Z",
					limits: { applications: 100 },
					entitlements: ["lifetime_access"],
				},
			],
		});
		expect(JSON.stringify(claims)).not.toContain("stripe");
	});

	it("merges completed purchases into entitlements and takes the max limit", () => {
		const claims = buildBillingScopeClaims(
			env,
			["billing:entitlements", "billing:limits"],
			subscriptions,
			catalog,
			purchases,
		);

		expect(claims).toEqual({
			[oauthClaimURL(env, "billing_entitlements")]: [
				"oauth",
				"billing",
				"organizations",
				"lifetime_access",
			],
			// applications: max(20 from team, 100 from lifetime); members only from team.
			[oauthClaimURL(env, "billing_limits")]: {
				members: 25,
				applications: 100,
			},
		});
	});

	it("excludes refunded purchases from entitlements", () => {
		const refunded: BillingPurchaseClaimSource[] = [
			{ ...purchases[0], status: "refunded" },
		];
		const claims = buildBillingScopeClaims(
			env,
			["billing:entitlements"],
			[],
			catalog,
			refunded,
		);

		expect(claims).toEqual({
			[oauthClaimURL(env, "billing_entitlements")]: [],
		});
	});
});
