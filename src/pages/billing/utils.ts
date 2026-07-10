/**
 * Pure helpers and constants for the billing module: status formatting, money
 * and date formatting, the customer-key convention, and conversions between the
 * admin plan record and the editor draft.
 */
import type { BillingPlanCatalogEntry } from "@/lib/billing";
import type { PriceInfo } from "@/lib/billing-groups";

import type {
	AdminBillingPlan,
	PlanDraft,
	StripeProductDraft,
	SubscriptionSummary,
} from "./types";

export const NO_GROUP_VALUE = "__none";

/** Personal (non-organization) customer key for the customer switcher. */
export const PERSONAL_KEY = "user";

// Where to find each Stripe identifier in the dashboard, surfaced as tooltips.
export const STRIPE_HINTS: Record<string, string> = {
	priceId: "Stripe → Product catalog → your product → Pricing → click a price → copy the API ID (price_…).",
	lookupKey: "Stripe → Product catalog → Pricing → a price's Lookup key (set when creating the price).",
	annualDiscountPriceId: "The annual price's API ID under the same product (price_…).",
	annualDiscountLookupKey: "The annual price's Lookup key.",
	seatPriceId: "A per-seat price's API ID (price_…) for metered/quantity team plans.",
};

export const STATUS_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
	active: "default",
	trialing: "secondary",
	past_due: "destructive",
	unpaid: "destructive",
	canceled: "outline",
	paused: "outline",
	incomplete: "outline",
	incomplete_expired: "outline",
};

export function statusLabel(status: string) {
	return status.replaceAll("_", " ");
}

export function formatDate(value?: string | Date | null) {
	if (!value) return "Not set";
	return new Date(value).toLocaleDateString();
}

// Stripe reports one-time totals in the currency's minor unit (e.g. cents).
export function formatPurchaseAmount(amount: number | null, currency: string | null) {
	if (amount === null) return null;
	const code = (currency ?? "usd").toUpperCase();
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: code,
		}).format(amount / 100);
	} catch {
		return `${(amount / 100).toFixed(2)} ${code}`;
	}
}

export function planTitle(plan: BillingPlanCatalogEntry | undefined, fallback: string) {
	return plan?.label ?? fallback.charAt(0).toUpperCase() + fallback.slice(1);
}

export function activeSubscription(subscriptions: readonly SubscriptionSummary[]) {
	return subscriptions.find((subscription) =>
		["active", "trialing", "past_due", "paused", "unpaid"].includes(subscription.status),
	);
}

export function limitEntries(limits: Record<string, unknown> | undefined) {
	if (!limits) return [];
	return Object.entries(limits).map(([key, value]) => ({ key, value: String(value) }));
}

export function formatAmount(price: PriceInfo): string {
	if (price.amount === null) return "—";
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: price.currency.toUpperCase(),
		}).format(price.amount / 100);
	} catch {
		return `${price.amount / 100} ${price.currency.toUpperCase()}`;
	}
}

// --- Plan editor draft <-> payload ---

export function emptyStripeProductDraft(): StripeProductDraft {
	return {
		enabled: false,
		productName: "",
		amount: "",
		currency: "usd",
		interval: "month",
		intervalCount: "",
		usageType: "",
		nickname: "",
		lookupKey: "",
		taxBehavior: "",
		statementDescriptor: "",
		unitLabel: "",
		taxCode: "",
		url: "",
		annualAmount: "",
		annualLookupKey: "",
		seatAmount: "",
		seatLookupKey: "",
	};
}

export function emptyPlanDraft(): PlanDraft {
	return {
		name: "",
		label: "",
		description: "",
		group: "",
		priceId: "",
		lookupKey: "",
		annualDiscountPriceId: "",
		annualDiscountLookupKey: "",
		seatPriceId: "",
		prorationBehavior: "",
		freeTrialDays: "",
		type: "subscription",
		personalOnly: false,
		hidden: false,
		entitlements: [],
		limits: {},
		stripe: emptyStripeProductDraft(),
	};
}

export function planToDraft(plan: AdminBillingPlan): PlanDraft {
	return {
		name: plan.name,
		label: plan.label ?? "",
		description: plan.description ?? "",
		group: plan.group ?? "",
		priceId: plan.priceId ?? "",
		lookupKey: plan.lookupKey ?? "",
		annualDiscountPriceId: plan.annualDiscountPriceId ?? "",
		annualDiscountLookupKey: plan.annualDiscountLookupKey ?? "",
		seatPriceId: plan.seatPriceId ?? "",
		prorationBehavior: plan.prorationBehavior ?? "",
		freeTrialDays: plan.freeTrialDays != null ? String(plan.freeTrialDays) : "",
		type: plan.type === "one_time" ? "one_time" : "subscription",
		personalOnly: Boolean(plan.personalOnly),
		hidden: Boolean(plan.hidden),
		entitlements: plan.entitlements ?? [],
		limits: Object.fromEntries(
			Object.entries(plan.limits ?? {}).map(([key, value]) => [key, String(value)]),
		),
		// Stripe provisioning is only offered on create; editing an existing plan
		// always starts from the manual-id fields.
		stripe: emptyStripeProductDraft(),
	};
}

function trimmed(value: string) {
	const normalized = value.trim();
	return normalized || undefined;
}

export function planDraftToPayload(
	draft: PlanDraft,
): { value: Record<string, unknown> } | { error: string } {
	const oneTime = draft.type === "one_time";
	const freeTrialDays =
		!oneTime && draft.freeTrialDays.trim() ? Number(draft.freeTrialDays) : undefined;
	if (freeTrialDays !== undefined && (!Number.isInteger(freeTrialDays) || freeTrialDays < 0)) {
		return { error: "Free trial days must be a non-negative integer." };
	}

	const limits: Record<string, unknown> = {};
	for (const [key, raw] of Object.entries(draft.limits)) {
		const value = raw.trim();
		if (!value) continue;
		const numeric = Number(value);
		limits[key] = Number.isFinite(numeric) && value !== "" ? numeric : value;
	}

	const stripeBlock = draft.stripe.enabled ? buildStripePayload(draft) : undefined;
	if (stripeBlock && "error" in stripeBlock) return stripeBlock;

	return {
		value: {
			name: draft.name.trim(),
			type: draft.type,
			personalOnly: draft.personalOnly,
			hidden: draft.hidden,
			...(trimmed(draft.label) ? { label: trimmed(draft.label) } : {}),
			...(trimmed(draft.description) ? { description: trimmed(draft.description) } : {}),
			...(trimmed(draft.group) ? { group: trimmed(draft.group) } : {}),
			...(trimmed(draft.priceId) ? { priceId: trimmed(draft.priceId) } : {}),
			...(trimmed(draft.lookupKey) ? { lookupKey: trimmed(draft.lookupKey) } : {}),
			// Annual, seat, proration, and trial only apply to recurring plans.
			...(!oneTime && trimmed(draft.annualDiscountPriceId)
				? { annualDiscountPriceId: trimmed(draft.annualDiscountPriceId) }
				: {}),
			...(!oneTime && trimmed(draft.annualDiscountLookupKey)
				? { annualDiscountLookupKey: trimmed(draft.annualDiscountLookupKey) }
				: {}),
			...(!oneTime && trimmed(draft.seatPriceId)
				? { seatPriceId: trimmed(draft.seatPriceId) }
				: {}),
			...(!oneTime && trimmed(draft.prorationBehavior)
				? { prorationBehavior: trimmed(draft.prorationBehavior) }
				: {}),
			...(freeTrialDays !== undefined ? { freeTrialDays } : {}),
			...(draft.entitlements.length ? { entitlements: draft.entitlements } : {}),
			...(Object.keys(limits).length ? { limits } : {}),
			...(stripeBlock ? { stripe: stripeBlock.value } : {}),
		},
	};
}

function optionalTrimmed(value: string) {
	const normalized = value.trim();
	return normalized || undefined;
}

// Build the Stripe Product/Price provisioning payload from the editor draft.
// Returns an error when the amount or currency is missing/invalid so the caller
// can surface it before hitting the server.
function buildStripePayload(
	draft: PlanDraft,
): { value: Record<string, unknown> } | { error: string } {
	const oneTime = draft.type === "one_time";
	const stripe = draft.stripe;

	const amount = Number(stripe.amount);
	if (!stripe.amount.trim() || !Number.isFinite(amount) || amount < 0) {
		return { error: "Enter a valid price amount to create the product in Stripe." };
	}
	const currency = stripe.currency.trim().toLowerCase();
	if (!/^[a-z]{3}$/.test(currency)) {
		return { error: "Enter a 3-letter currency code (e.g. usd)." };
	}

	const intervalCount = stripe.intervalCount.trim() ? Number(stripe.intervalCount) : undefined;
	if (
		intervalCount !== undefined &&
		(!Number.isInteger(intervalCount) || intervalCount < 1)
	) {
		return { error: "Billing period count must be a positive integer." };
	}
	const annualAmount = stripe.annualAmount.trim() ? Number(stripe.annualAmount) : undefined;
	if (annualAmount !== undefined && (!Number.isFinite(annualAmount) || annualAmount < 0)) {
		return { error: "Annual price must be a non-negative amount." };
	}
	const seatAmount = stripe.seatAmount.trim() ? Number(stripe.seatAmount) : undefined;
	if (seatAmount !== undefined && (!Number.isFinite(seatAmount) || seatAmount < 0)) {
		return { error: "Seat price must be a non-negative amount." };
	}

	return {
		value: {
			amount,
			currency,
			...(optionalTrimmed(stripe.productName)
				? { productName: optionalTrimmed(stripe.productName) }
				: {}),
			...(optionalTrimmed(stripe.statementDescriptor)
				? { statementDescriptor: optionalTrimmed(stripe.statementDescriptor) }
				: {}),
			...(optionalTrimmed(stripe.unitLabel)
				? { unitLabel: optionalTrimmed(stripe.unitLabel) }
				: {}),
			...(optionalTrimmed(stripe.taxCode) ? { taxCode: optionalTrimmed(stripe.taxCode) } : {}),
			...(optionalTrimmed(stripe.url) ? { url: optionalTrimmed(stripe.url) } : {}),
			...(optionalTrimmed(stripe.nickname)
				? { nickname: optionalTrimmed(stripe.nickname) }
				: {}),
			...(optionalTrimmed(stripe.lookupKey)
				? { lookupKey: optionalTrimmed(stripe.lookupKey) }
				: {}),
			...(stripe.taxBehavior ? { taxBehavior: stripe.taxBehavior } : {}),
			// Recurring shape, annual, and seat pricing only apply to subscriptions.
			...(!oneTime ? { interval: stripe.interval } : {}),
			...(!oneTime && intervalCount !== undefined ? { intervalCount } : {}),
			...(!oneTime && stripe.usageType ? { usageType: stripe.usageType } : {}),
			...(!oneTime && annualAmount !== undefined ? { annualAmount } : {}),
			...(!oneTime && annualAmount !== undefined && optionalTrimmed(stripe.annualLookupKey)
				? { annualLookupKey: optionalTrimmed(stripe.annualLookupKey) }
				: {}),
			...(!oneTime && seatAmount !== undefined ? { seatAmount } : {}),
			...(!oneTime && seatAmount !== undefined && optionalTrimmed(stripe.seatLookupKey)
				? { seatLookupKey: optionalTrimmed(stripe.seatLookupKey) }
				: {}),
		},
	};
}
