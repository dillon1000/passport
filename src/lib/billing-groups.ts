/**
 * Plan catalog grouping for the billing UI. Buckets plans by their `group`
 * field (the "app"); plans without a group collapse into a single "Other"
 * bucket sorted last so nothing disappears from the catalog.
 */
import type { BillingPlanCatalogEntry } from "./billing";

export const OTHER_GROUP = "Other";

export type PlanGroup = {
	group: string;
	plans: BillingPlanCatalogEntry[];
};

export function groupPlansByApp(plans: readonly BillingPlanCatalogEntry[]): PlanGroup[] {
	const groups = new Map<string, BillingPlanCatalogEntry[]>();
	for (const plan of plans) {
		const key = plan.group?.trim() || OTHER_GROUP;
		const bucket = groups.get(key);
		if (bucket) bucket.push(plan);
		else groups.set(key, [plan]);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => {
			if (a === OTHER_GROUP) return 1;
			if (b === OTHER_GROUP) return -1;
			return a.localeCompare(b);
		})
		.map(([group, groupPlans]) => ({ group, plans: groupPlans }));
}

// --- Pricing table ---

export type PriceInfo = {
	amount: number | null;
	currency: string;
	interval?: string;
	intervalCount?: number;
};

export type PricingPlanInput = {
	name: string;
	label?: string | null;
	priceId?: string | null;
	entitlements?: string[] | null;
	limits?: Record<string, unknown> | null;
	freeTrialDays?: number | null;
};

export type PricingMatrix = {
	columns: { name: string; label: string; price: string }[];
	rows: {
		kind: "entitlement" | "limit" | "trial";
		key: string;
		label: string;
		cells: (boolean | string)[];
	}[];
};

/** Format a resolved Stripe price for display, e.g. "$20.00/mo". */
export function formatPriceInfo(price: PriceInfo | undefined): string {
	if (!price || price.amount === null) return "—";
	const amount = price.amount / 100;
	const formatted = (() => {
		try {
			return new Intl.NumberFormat(undefined, {
				style: "currency",
				currency: price.currency.toUpperCase(),
			}).format(amount);
		} catch {
			return `${amount} ${price.currency.toUpperCase()}`;
		}
	})();
	if (!price.interval) return formatted;
	const intervalLabel =
		price.intervalCount && price.intervalCount > 1
			? `${price.intervalCount} ${price.interval}s`
			: price.interval;
	return `${formatted}/${intervalLabel}`;
}

/**
 * Build a comparison matrix across a set of plans. Rows are friendly-named
 * entitlements (✓/✗), limits (value + unit), and trial; columns are the plans
 * with a formatted price resolved from `prices` by priceId.
 */
export function buildPricingMatrix(
	plans: readonly PricingPlanInput[],
	labels: {
		entitlementLabels: Record<string, string>;
		limitLabels: Record<string, { name: string; unit?: string }>;
	},
	prices: Record<string, PriceInfo>,
): PricingMatrix {
	const columns = plans.map((plan) => ({
		name: plan.name,
		label: plan.label?.trim() || plan.name,
		price: plan.priceId ? formatPriceInfo(prices[plan.priceId]) : "—",
	}));

	const entitlementKeys = [
		...new Set(plans.flatMap((plan) => plan.entitlements ?? [])),
	].sort((a, b) =>
		(labels.entitlementLabels[a] ?? a).localeCompare(labels.entitlementLabels[b] ?? b),
	);
	const limitKeys = [
		...new Set(plans.flatMap((plan) => Object.keys(plan.limits ?? {}))),
	].sort((a, b) =>
		(labels.limitLabels[a]?.name ?? a).localeCompare(labels.limitLabels[b]?.name ?? b),
	);

	const rows: PricingMatrix["rows"] = [];

	for (const key of entitlementKeys) {
		rows.push({
			kind: "entitlement",
			key,
			label: labels.entitlementLabels[key] ?? key,
			cells: plans.map((plan) => (plan.entitlements ?? []).includes(key)),
		});
	}

	for (const key of limitKeys) {
		const meta = labels.limitLabels[key];
		const unit = meta?.unit ? ` ${meta.unit}` : "";
		rows.push({
			kind: "limit",
			key,
			label: meta?.name ?? key,
			cells: plans.map((plan) => {
				const value = plan.limits?.[key];
				return value === undefined || value === null ? false : `${String(value)}${unit}`;
			}),
		});
	}

	if (plans.some((plan) => plan.freeTrialDays)) {
		rows.push({
			kind: "trial",
			key: "__trial",
			label: "Free trial",
			cells: plans.map((plan) =>
				plan.freeTrialDays ? `${plan.freeTrialDays} days` : false,
			),
		});
	}

	return { columns, rows };
}
