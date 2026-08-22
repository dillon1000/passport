import { describe, expect, it } from "vitest";

import {
	createBillingPlan,
	loadBillingPlans,
	type BillingPlanInsert,
	type BillingPlanRow,
} from "./billing-plan-store";

const envWithPlans = {
	STRIPE_BILLING_PLANS: JSON.stringify([
		{ name: "pro", priceId: "price_pro", group: "Acme", entitlements: ["api"] },
	]),
};

describe("loadBillingPlans", () => {
	it("falls back to STRIPE_BILLING_PLANS when the table is empty", async () => {
		const plans = await loadBillingPlans(envWithPlans, undefined, { readRows: async () => [] });
		expect(plans).toEqual([
			expect.objectContaining({ name: "pro", priceId: "price_pro", group: "Acme" }),
		]);
	});

	it("maps table rows to plan definitions when present", async () => {
		const rows: BillingPlanRow[] = [
			{
				id: "plan_1",
				name: "team",
				label: "Team",
				description: null,
				group: "Acme",
				priceId: "price_team",
				lookupKey: null,
				annualDiscountPriceId: null,
				annualDiscountLookupKey: null,
				seatPriceId: "price_seat",
				prorationBehavior: null,
				freeTrialDays: 14,
				displayOrder: 0,
				limits: { seats: 10 },
				entitlements: ["api", "sso"],
				lineItems: null,
				type: "subscription",
				personalOnly: false,
				hidden: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const plans = await loadBillingPlans(
			{ STRIPE_BILLING_PLANS: undefined },
			undefined,
			{ readRows: async () => rows },
		);
		expect(plans).toEqual([
			{
				name: "team",
				label: "Team",
				group: "Acme",
				priceId: "price_team",
				seatPriceId: "price_seat",
				freeTrialDays: 14,
				limits: { seats: 10 },
				entitlements: ["api", "sso"],
			},
		]);
	});
});

describe("createBillingPlan", () => {
	it("rejects a plan without a price ID or lookup key", async () => {
		await expect(createBillingPlan(undefined, { name: "pro" })).rejects.toThrow(
			/priceId or lookupKey/,
		);
	});

	it("lowercases the plan key and persists normalized columns", async () => {
		let captured: BillingPlanInsert | undefined;
		await createBillingPlan(undefined, {
			name: "Pro",
			priceId: "price_pro",
			group: "Acme",
			entitlements: ["api"],
			displayOrder: 3,
		}, { insertPlan: async (values) => {
			captured = values;
			return { ...values, createdAt: new Date(), updatedAt: new Date() };
		} });
		expect(captured).toMatchObject({
			name: "pro",
			priceId: "price_pro",
			group: "Acme",
			entitlements: ["api"],
			displayOrder: 3,
		});
		expect(captured?.id).toBeTypeOf("string");
	});

	it("rejects a negative display order", async () => {
		await expect(
			createBillingPlan(undefined, { name: "pro", priceId: "price_pro", displayOrder: -1 }),
		).rejects.toThrow(/displayOrder/);
	});
});
