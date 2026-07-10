import { describe, expect, it, vi } from "vitest";

import {
	createBillingPlan,
	loadBillingPlans,
} from "./billing-plan-store";
import type { AuthDatabase } from "./auth-server/types";

// Minimal drizzle stand-ins: the store only uses select→from→orderBy for reads
// and insert→values→returning for writes, so we fake just those chains.
function readDb(rows: unknown[]): AuthDatabase {
	return {
		select: () => ({
			from: () => ({
				orderBy: () => Promise.resolve(rows),
			}),
		}),
	} as unknown as AuthDatabase;
}

function insertDb(capture: (values: Record<string, unknown>) => void): AuthDatabase {
	return {
		insert: () => ({
			values: (values: Record<string, unknown>) => {
				capture(values);
				return { returning: () => Promise.resolve([{ ...values }]) };
			},
		}),
	} as unknown as AuthDatabase;
}

const envWithPlans = {
	STRIPE_BILLING_PLANS: JSON.stringify([
		{ name: "pro", priceId: "price_pro", group: "Acme", entitlements: ["api"] },
	]),
};

describe("loadBillingPlans", () => {
	it("falls back to STRIPE_BILLING_PLANS when the table is empty", async () => {
		const plans = await loadBillingPlans(envWithPlans, readDb([]));
		expect(plans).toEqual([
			expect.objectContaining({ name: "pro", priceId: "price_pro", group: "Acme" }),
		]);
	});

	it("maps table rows to plan definitions when present", async () => {
		const rows = [
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
			},
		];
		const plans = await loadBillingPlans({ STRIPE_BILLING_PLANS: undefined }, readDb(rows));
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
		const insert = vi.fn();
		const db = { insert } as unknown as AuthDatabase;
		await expect(createBillingPlan(db, { name: "pro" })).rejects.toThrow(
			/priceId or lookupKey/,
		);
		expect(insert).not.toHaveBeenCalled();
	});

	it("lowercases the plan key and persists normalized columns", async () => {
		let captured: Record<string, unknown> | undefined;
		const db = insertDb((values) => {
			captured = values;
		});
		await createBillingPlan(db, {
			name: "Pro",
			priceId: "price_pro",
			group: "Acme",
			entitlements: ["api"],
			displayOrder: 3,
		});
		expect(captured).toMatchObject({
			name: "pro",
			priceId: "price_pro",
			group: "Acme",
			entitlements: ["api"],
			displayOrder: 3,
		});
		expect(typeof captured?.id).toBe("string");
	});

	it("rejects a negative display order", async () => {
		const insert = vi.fn();
		const db = { insert } as unknown as AuthDatabase;
		await expect(
			createBillingPlan(db, { name: "pro", priceId: "price_pro", displayOrder: -1 }),
		).rejects.toThrow(/displayOrder/);
		expect(insert).not.toHaveBeenCalled();
	});
});
