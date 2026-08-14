import { describe, expect, it } from "vitest";

import {
	DEFAULT_STRIPE_API_VERSION,
	billingPlanCatalog,
	billingPlanCatalogEntry,
	catalogPriceIds,
	parseStripeBillingPlans,
	stripeCheckoutDefaults,
	stripePlansFromBillingPlans,
	validateBillingPlanInput,
	validateStripeProductInput,
} from "./billing";

describe("Stripe billing configuration", () => {
	it("parses env-driven plans into Stripe plans and Passport metadata", () => {
		const plans = parseStripeBillingPlans(
			JSON.stringify([
				{
					name: "team",
					label: "Team",
					description: "Shared workspace billing.",
					priceId: "price_team_month",
					annualDiscountPriceId: "price_team_year",
					seatPriceId: "price_team_seat",
					group: "workspace",
					prorationBehavior: "none",
					limits: {
						members: 25,
						applications: 20,
					},
					entitlements: ["oauth", "billing", "organizations"],
					freeTrialDays: 14,
					lineItems: [
						{
							price: "price_support_month",
							quantity: 1,
						},
					],
				},
			]),
		);

		expect(stripePlansFromBillingPlans(plans)).toEqual([
			{
				name: "team",
				priceId: "price_team_month",
				annualDiscountPriceId: "price_team_year",
				seatPriceId: "price_team_seat",
				group: "workspace",
				prorationBehavior: "none",
				limits: {
					members: 25,
					applications: 20,
				},
				freeTrial: {
					days: 14,
				},
				lineItems: [
					{
						price: "price_support_month",
						quantity: 1,
					},
				],
			},
		]);
		expect(billingPlanCatalog(plans)).toEqual({
			team: {
				name: "team",
				label: "Team",
				description: "Shared workspace billing.",
				group: "workspace",
				limits: {
					members: 25,
					applications: 20,
				},
				entitlements: ["oauth", "billing", "organizations"],
				hasFreeTrial: true,
				hasAnnualDiscount: true,
				type: "subscription",
				personalOnly: false,
				hidden: false,
			},
		});
	});

	it("supports lookup-key plans and rejects plans without a price source", () => {
		expect(
			stripePlansFromBillingPlans(
				parseStripeBillingPlans(
					JSON.stringify([
						{
							name: "pro",
							lookupKey: "passport_pro_monthly",
							annualDiscountLookupKey: "passport_pro_yearly",
						},
					]),
				),
			),
		).toEqual([
			{
				name: "pro",
				lookupKey: "passport_pro_monthly",
				annualDiscountLookupKey: "passport_pro_yearly",
			},
		]);

		expect(() => parseStripeBillingPlans(JSON.stringify([{ name: "broken" }]))).toThrow(
			"STRIPE_BILLING_PLANS[0] must define priceId or lookupKey.",
		);
	});

	it("accepts zero free trial days, one-time plans, and personal-only plans", () => {
		const plan = validateBillingPlanInput(
			{
				name: "lifetime",
				priceId: "price_lifetime",
				type: "one_time",
				personalOnly: true,
				freeTrialDays: 0,
			},
			"plan",
		);
		expect(plan).toMatchObject({
			name: "lifetime",
			type: "one_time",
			personalOnly: true,
			freeTrialDays: 0,
		});

		const catalog = billingPlanCatalog([plan]);
		expect(catalog.lifetime).toMatchObject({ type: "one_time", personalOnly: true });
		// One-time plans expose no recurring trial flag.
		expect(catalog.lifetime?.hasFreeTrial).toBe(false);
	});

	it("rejects negative trial days and unknown plan types", () => {
		expect(() =>
			validateBillingPlanInput(
				{ name: "pro", priceId: "price_pro", freeTrialDays: -1 },
				"plan",
			),
		).toThrow("plan.freeTrialDays must be a non-negative integer.");
		expect(() =>
			validateBillingPlanInput({ name: "pro", priceId: "price_pro", type: "rental" }, "plan"),
		).toThrow("plan.type must be one of: subscription, one_time.");
	});

	it("normalizes a Stripe product provisioning request", () => {
		expect(
			validateStripeProductInput(
				{
					amount: 29.99,
					currency: "USD",
					interval: "month",
					intervalCount: 1,
					usageType: "licensed",
					nickname: "Pro monthly",
					lookupKey: "pro_monthly",
					taxBehavior: "exclusive",
					statementDescriptor: "ACME PRO",
					annualAmount: 290,
					seatAmount: 10,
				},
				"stripe",
			),
		).toEqual({
			amount: 29.99,
			currency: "usd",
			interval: "month",
			intervalCount: 1,
			usageType: "licensed",
			nickname: "Pro monthly",
			lookupKey: "pro_monthly",
			taxBehavior: "exclusive",
			statementDescriptor: "ACME PRO",
			annualAmount: 290,
			seatAmount: 10,
		});
	});

	it("rejects invalid Stripe product provisioning requests", () => {
		expect(() => validateStripeProductInput({ currency: "usd" }, "stripe")).toThrow(
			"stripe.amount is required.",
		);
		expect(() => validateStripeProductInput({ amount: 10, currency: "us" }, "stripe")).toThrow(
			"stripe.currency must be a 3-letter ISO currency code.",
		);
		expect(() =>
			validateStripeProductInput({ amount: -1, currency: "usd" }, "stripe"),
		).toThrow("stripe.amount must be a non-negative amount.");
		expect(() =>
			validateStripeProductInput({ amount: 10, currency: "usd", interval: "decade" }, "stripe"),
		).toThrow("stripe.interval must be one of: day, week, month, year.");
	});

	it("attaches resolved primary and annual prices to catalog entries", () => {
		const plan = {
			name: "pro",
			priceId: "price_month",
			annualDiscountPriceId: "price_year",
		};
		expect(catalogPriceIds([plan])).toEqual(["price_month", "price_year"]);

		const entry = billingPlanCatalogEntry(plan, "prod_1", {
			price_month: { amount: 2999, currency: "usd", interval: "month" },
			price_year: { amount: 29900, currency: "usd", interval: "year" },
		});
		expect(entry.price).toEqual({ amount: 2999, currency: "usd", interval: "month" });
		expect(entry.annualPrice).toEqual({ amount: 29900, currency: "usd", interval: "year" });
	});

	it("omits prices that fail to resolve", () => {
		const entry = billingPlanCatalogEntry({ name: "pro", priceId: "price_x" }, undefined, {});
		expect(entry.price).toBeUndefined();
		expect(entry.annualPrice).toBeUndefined();
	});

	it("builds checkout customization defaults from env", () => {
		expect(DEFAULT_STRIPE_API_VERSION).toBe("2026-05-27.dahlia");
		expect(
			stripeCheckoutDefaults({
				STRIPE_CHECKOUT_ALLOW_PROMOTION_CODES: "true",
				STRIPE_CHECKOUT_AUTOMATIC_TAX_ENABLED: "true",
				STRIPE_CHECKOUT_TAX_ID_COLLECTION_ENABLED: "true",
				STRIPE_CHECKOUT_BILLING_ADDRESS_COLLECTION: "required",
				STRIPE_CHECKOUT_CUSTOM_TEXT_SUBMIT_MESSAGE: "We will start billing today.",
			}),
		).toEqual({
			allowPromotionCodes: true,
			automaticTaxEnabled: true,
			taxIDCollectionEnabled: true,
			billingAddressCollection: "required",
			customTextSubmitMessage: "We will start billing today.",
		});
	});
});
