import { describe, expect, it } from "vitest";

import type { BillingPlanCatalogEntry } from "@/lib/billing";

import { groupPlansByApp } from "@/lib/billing-groups";

import { billingSection } from "@/pages/billing/billing-section";

function plan(name: string, group?: string): BillingPlanCatalogEntry {
	const base: BillingPlanCatalogEntry = {
		name,
		entitlements: [],
		hasFreeTrial: false,
		hasAnnualDiscount: false,
		type: "subscription",
		personalOnly: false,
		hidden: false,
	};
	if (group) return { ...base, group };
	return base;
}

describe("groupPlansByApp", () => {
	it("groups plans by app and sorts named groups before the Other bucket", () => {
		const grouped = groupPlansByApp([
			plan("free"),
			plan("pro", "Beacon"),
			plan("team", "Acme"),
			plan("starter", "Acme"),
		]);

		expect(grouped.map((entry) => entry.group)).toEqual(["Acme", "Beacon", "Other"]);
		expect(grouped[0]?.plans.map((p) => p.name)).toEqual(["team", "starter"]);
		expect(grouped.at(-1)?.group).toBe("Other");
		expect(grouped.at(-1)?.plans.map((p) => p.name)).toEqual(["free"]);
	});

	it("returns no Other bucket when every plan has a group", () => {
		const grouped = groupPlansByApp([plan("pro", "Acme")]);
		expect(grouped.map((entry) => entry.group)).toEqual(["Acme"]);
	});
});

describe("Billing", () => {
	it("selects the overview section for the billing root", () => {
		expect(billingSection("/billing")).toBe("overview");
	});

	it("selects the plans section", () => {
		expect(billingSection("/billing/plans")).toBe("plans");
	});

	it("selects the purchases section", () => {
		expect(billingSection("/billing/purchases")).toBe("purchases");
	});

	it("keeps unknown billing routes on the overview", () => {
		expect(billingSection("/billing/other")).toBe("overview");
	});
});
