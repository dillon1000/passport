/**
 * Stripe billing configuration helpers. Inputs are deployment environment
 * values, especially `STRIPE_BILLING_PLANS`; outputs are Better Auth Stripe
 * plan objects for the server plugin plus a secret-free plan catalog for UI and
 * OAuth claims. Safe configuration points are plan JSON, checkout defaults, and
 * Stripe API version env values.
 */
import type { CheckoutSessionLineItem, StripePlan } from "@better-auth/stripe";

import { optionalEnv, parseOptionalBoolean } from "./auth-server/env";

export const DEFAULT_STRIPE_API_VERSION = "2026-05-27.dahlia";

const STRIPE_PRORATION_BEHAVIORS = [
	"create_prorations",
	"always_invoice",
	"none",
] as const satisfies NonNullable<StripePlan["prorationBehavior"]>[];

type StripeProrationBehavior = (typeof STRIPE_PRORATION_BEHAVIORS)[number];

export const BILLING_PLAN_TYPES = ["subscription", "one_time"] as const;

export type BillingPlanType = (typeof BILLING_PLAN_TYPES)[number];

export const STRIPE_PRICE_INTERVALS = ["day", "week", "month", "year"] as const;

export type StripePriceInterval = (typeof STRIPE_PRICE_INTERVALS)[number];

export const STRIPE_USAGE_TYPES = ["licensed", "metered"] as const;

export type StripeUsageType = (typeof STRIPE_USAGE_TYPES)[number];

export const STRIPE_TAX_BEHAVIORS = ["unspecified", "inclusive", "exclusive"] as const;

export type StripeTaxBehavior = (typeof STRIPE_TAX_BEHAVIORS)[number];

/**
 * Admin-supplied request to provision a brand-new Stripe Product and Price(s)
 * when a plan is created, instead of pasting an existing `price_…` id. `amount`
 * fields are decimal major units (e.g. 29.99) and are converted to Stripe's
 * minor units at provisioning time.
 */
export type StripeProductProvisionInput = {
	productName?: string;
	description?: string;
	statementDescriptor?: string;
	unitLabel?: string;
	taxCode?: string;
	url?: string;
	amount: number;
	currency: string;
	interval?: StripePriceInterval;
	intervalCount?: number;
	usageType?: StripeUsageType;
	nickname?: string;
	lookupKey?: string;
	taxBehavior?: StripeTaxBehavior;
	annualAmount?: number;
	annualLookupKey?: string;
	seatAmount?: number;
	seatLookupKey?: string;
};

export type StripeCheckoutDefaultsEnv = {
	STRIPE_CHECKOUT_ALLOW_PROMOTION_CODES?: string;
	STRIPE_CHECKOUT_AUTOMATIC_TAX_ENABLED?: string;
	STRIPE_CHECKOUT_TAX_ID_COLLECTION_ENABLED?: string;
	STRIPE_CHECKOUT_BILLING_ADDRESS_COLLECTION?: string;
	STRIPE_CHECKOUT_CUSTOM_TEXT_SUBMIT_MESSAGE?: string;
};

export type StripeCheckoutDefaults = {
	allowPromotionCodes?: boolean;
	automaticTaxEnabled?: boolean;
	taxIDCollectionEnabled?: boolean;
	billingAddressCollection?: "auto" | "required";
	customTextSubmitMessage?: string;
};

export type BillingPlanDefinition = {
	name: string;
	label?: string;
	description?: string;
	priceId?: string;
	lookupKey?: string;
	annualDiscountPriceId?: string;
	annualDiscountLookupKey?: string;
	limits?: Record<string, unknown>;
	entitlements?: string[];
	group?: string;
	seatPriceId?: string;
	prorationBehavior?: StripeProrationBehavior;
	lineItems?: CheckoutSessionLineItem[];
	freeTrialDays?: number;
	type?: BillingPlanType;
	personalOnly?: boolean;
	hidden?: boolean;
};

/**
 * Public, secret-free resolved price shown in the catalog. Carries the amount
 * (in the currency's minor unit), currency, and recurring cadence, but never the
 * Stripe `price_…` id itself.
 */
export type CatalogPrice = {
	amount: number | null;
	currency: string;
	interval?: string;
	intervalCount?: number;
};

export type BillingPlanCatalogEntry = {
	/** Stable plan id (`prod_…`), present on single-product deeplink responses. */
	id?: string;
	name: string;
	label?: string;
	description?: string;
	group?: string;
	limits?: Record<string, unknown>;
	entitlements: string[];
	hasFreeTrial: boolean;
	hasAnnualDiscount: boolean;
	type: BillingPlanType;
	personalOnly: boolean;
	hidden: boolean;
	/** Resolved primary (monthly/one-time) price, when Stripe resolution succeeds. */
	price?: CatalogPrice;
	/** Resolved annual price, when the plan has one and resolution succeeds. */
	annualPrice?: CatalogPrice;
};

export type BillingPlanCatalog = Record<string, BillingPlanCatalogEntry>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown) {
	const normalized = typeof value === "string" ? value.trim() : "";
	return normalized || undefined;
}

function optionalRecord(value: unknown, name: string) {
	if (value === undefined || value === null) return undefined;
	if (isRecord(value)) return value;
	throw new TypeError(`${name} must be an object.`);
}

function optionalStringArray(value: unknown, name: string) {
	if (value === undefined || value === null) return undefined;
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new TypeError(`${name} must be an array of strings.`);
	}
	return value.map((item) => item.trim()).filter(Boolean);
}

function optionalNonNegativeInteger(value: unknown, name: string) {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new TypeError(`${name} must be a non-negative integer.`);
	}
	return value;
}

function optionalBoolean(value: unknown, name: string) {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "boolean") {
		throw new TypeError(`${name} must be a boolean.`);
	}
	return value;
}

function optionalPlanType(value: unknown, name: string): BillingPlanType | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string" || !BILLING_PLAN_TYPES.includes(value as BillingPlanType)) {
		throw new TypeError(`${name} must be one of: ${BILLING_PLAN_TYPES.join(", ")}.`);
	}
	return value as BillingPlanType;
}

function optionalProrationBehavior(value: unknown, name: string) {
	const behavior = optionalString(value);
	if (!behavior) return undefined;
	if (STRIPE_PRORATION_BEHAVIORS.includes(behavior as StripeProrationBehavior)) {
		return behavior as StripeProrationBehavior;
	}
	throw new TypeError(
		`${name} must be one of: ${STRIPE_PRORATION_BEHAVIORS.join(", ")}.`,
	);
}

function optionalLineItems(value: unknown, name: string) {
	if (value === undefined || value === null) return undefined;
	if (!Array.isArray(value)) {
		throw new TypeError(`${name} must be an array.`);
	}
	for (const [index, item] of value.entries()) {
		if (!isRecord(item)) {
			throw new TypeError(`${name}[${index}] must be an object.`);
		}
		if (!optionalString(item.price)) {
			throw new TypeError(`${name}[${index}].price is required.`);
		}
		const quantity = item.quantity;
		if (
			quantity !== undefined &&
			quantity !== null &&
			(typeof quantity !== "number" ||
				!Number.isInteger(quantity) ||
				quantity < 1)
		) {
			throw new TypeError(`${name}[${index}].quantity must be a positive integer.`);
		}
	}
	return value as CheckoutSessionLineItem[];
}

/**
 * Validate and normalize a single plan object into a BillingPlanDefinition.
 * `label` prefixes error messages so callers can point at the offending source
 * (`STRIPE_BILLING_PLANS[2]` for env parsing, `plan` for admin DB writes).
 */
export function validateBillingPlanInput(
	value: unknown,
	label: string,
): BillingPlanDefinition {
	if (!isRecord(value)) {
		throw new TypeError(`${label} must be an object.`);
	}

	const name = optionalString(value.name);
	if (!name) {
		throw new TypeError(`${label}.name is required.`);
	}

	const priceId = optionalString(value.priceId);
	const lookupKey = optionalString(value.lookupKey);
	if (!priceId && !lookupKey) {
		throw new TypeError(`${label} must define priceId or lookupKey.`);
	}

	const type = optionalPlanType(value.type, `${label}.type`);
	const personalOnly = optionalBoolean(value.personalOnly, `${label}.personalOnly`);
	const hidden = optionalBoolean(value.hidden, `${label}.hidden`);
	const freeTrialDays = optionalNonNegativeInteger(value.freeTrialDays, `${label}.freeTrialDays`);

	return {
		name,
		...(optionalString(value.label) ? { label: optionalString(value.label) } : {}),
		...(optionalString(value.description)
			? { description: optionalString(value.description) }
			: {}),
		...(priceId ? { priceId } : {}),
		...(lookupKey ? { lookupKey } : {}),
		...(optionalString(value.annualDiscountPriceId)
			? { annualDiscountPriceId: optionalString(value.annualDiscountPriceId) }
			: {}),
		...(optionalString(value.annualDiscountLookupKey)
			? { annualDiscountLookupKey: optionalString(value.annualDiscountLookupKey) }
			: {}),
		...(optionalRecord(value.limits, `${label}.limits`)
			? { limits: optionalRecord(value.limits, `${label}.limits`) }
			: {}),
		...(optionalStringArray(value.entitlements, `${label}.entitlements`)
			? {
					entitlements: optionalStringArray(
						value.entitlements,
						`${label}.entitlements`,
					),
				}
			: {}),
		...(optionalString(value.group) ? { group: optionalString(value.group) } : {}),
		...(optionalString(value.seatPriceId)
			? { seatPriceId: optionalString(value.seatPriceId) }
			: {}),
		...(optionalProrationBehavior(value.prorationBehavior, `${label}.prorationBehavior`)
			? {
					prorationBehavior: optionalProrationBehavior(
						value.prorationBehavior,
						`${label}.prorationBehavior`,
					),
				}
			: {}),
		...(optionalLineItems(value.lineItems, `${label}.lineItems`)
			? {
					lineItems: optionalLineItems(value.lineItems, `${label}.lineItems`),
				}
			: {}),
		...(freeTrialDays !== undefined ? { freeTrialDays } : {}),
		...(type ? { type } : {}),
		...(personalOnly !== undefined ? { personalOnly } : {}),
		...(hidden !== undefined ? { hidden } : {}),
	};
}

function optionalEnumValue<T extends string>(
	value: unknown,
	name: string,
	allowed: readonly T[],
): T | undefined {
	const normalized = optionalString(value);
	if (!normalized) return undefined;
	if (!allowed.includes(normalized as T)) {
		throw new TypeError(`${name} must be one of: ${allowed.join(", ")}.`);
	}
	return normalized as T;
}

function optionalAmount(value: unknown, name: string) {
	if (value === undefined || value === null || value === "") return undefined;
	const amount = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(amount) || amount < 0) {
		throw new TypeError(`${name} must be a non-negative amount.`);
	}
	return amount;
}

function requiredAmount(value: unknown, name: string) {
	const amount = optionalAmount(value, name);
	if (amount === undefined) {
		throw new TypeError(`${name} is required.`);
	}
	return amount;
}

/**
 * Validate and normalize an admin request to create a new Stripe Product and
 * Price(s). `label` prefixes error messages. `amount`/`annualAmount`/`seatAmount`
 * are decimal major units; the Stripe provisioner converts them to minor units.
 */
export function validateStripeProductInput(
	value: unknown,
	label: string,
): StripeProductProvisionInput {
	if (!isRecord(value)) {
		throw new TypeError(`${label} must be an object.`);
	}

	const currency = optionalString(value.currency)?.toLowerCase();
	if (!currency || !/^[a-z]{3}$/.test(currency)) {
		throw new TypeError(`${label}.currency must be a 3-letter ISO currency code.`);
	}

	return {
		amount: requiredAmount(value.amount, `${label}.amount`),
		currency,
		...(optionalString(value.productName)
			? { productName: optionalString(value.productName) }
			: {}),
		...(optionalString(value.description)
			? { description: optionalString(value.description) }
			: {}),
		...(optionalString(value.statementDescriptor)
			? { statementDescriptor: optionalString(value.statementDescriptor) }
			: {}),
		...(optionalString(value.unitLabel) ? { unitLabel: optionalString(value.unitLabel) } : {}),
		...(optionalString(value.taxCode) ? { taxCode: optionalString(value.taxCode) } : {}),
		...(optionalString(value.url) ? { url: optionalString(value.url) } : {}),
		...(optionalEnumValue(value.interval, `${label}.interval`, STRIPE_PRICE_INTERVALS)
			? { interval: optionalEnumValue(value.interval, `${label}.interval`, STRIPE_PRICE_INTERVALS) }
			: {}),
		...(optionalNonNegativeInteger(value.intervalCount, `${label}.intervalCount`)
			? { intervalCount: optionalNonNegativeInteger(value.intervalCount, `${label}.intervalCount`) }
			: {}),
		...(optionalEnumValue(value.usageType, `${label}.usageType`, STRIPE_USAGE_TYPES)
			? { usageType: optionalEnumValue(value.usageType, `${label}.usageType`, STRIPE_USAGE_TYPES) }
			: {}),
		...(optionalString(value.nickname) ? { nickname: optionalString(value.nickname) } : {}),
		...(optionalString(value.lookupKey) ? { lookupKey: optionalString(value.lookupKey) } : {}),
		...(optionalEnumValue(value.taxBehavior, `${label}.taxBehavior`, STRIPE_TAX_BEHAVIORS)
			? {
					taxBehavior: optionalEnumValue(
						value.taxBehavior,
						`${label}.taxBehavior`,
						STRIPE_TAX_BEHAVIORS,
					),
				}
			: {}),
		...(optionalAmount(value.annualAmount, `${label}.annualAmount`) !== undefined
			? { annualAmount: optionalAmount(value.annualAmount, `${label}.annualAmount`) }
			: {}),
		...(optionalString(value.annualLookupKey)
			? { annualLookupKey: optionalString(value.annualLookupKey) }
			: {}),
		...(optionalAmount(value.seatAmount, `${label}.seatAmount`) !== undefined
			? { seatAmount: optionalAmount(value.seatAmount, `${label}.seatAmount`) }
			: {}),
		...(optionalString(value.seatLookupKey)
			? { seatLookupKey: optionalString(value.seatLookupKey) }
			: {}),
	};
}

function parseBillingPlan(value: unknown, index: number): BillingPlanDefinition {
	return validateBillingPlanInput(value, `STRIPE_BILLING_PLANS[${index}]`);
}

export function parseStripeBillingPlans(value: string | undefined) {
	const raw = optionalEnv(value);
	if (!raw) return [];
	const parsed = JSON.parse(raw) as unknown;
	if (!Array.isArray(parsed)) {
		throw new TypeError("STRIPE_BILLING_PLANS must be a JSON array.");
	}
	return parsed.map(parseBillingPlan);
}

export function stripePlansFromBillingPlans(
	plans: readonly BillingPlanDefinition[],
): StripePlan[] {
	return plans.map((plan) => ({
		name: plan.name,
		...(plan.priceId ? { priceId: plan.priceId } : {}),
		...(plan.lookupKey ? { lookupKey: plan.lookupKey } : {}),
		...(plan.annualDiscountPriceId
			? { annualDiscountPriceId: plan.annualDiscountPriceId }
			: {}),
		...(plan.annualDiscountLookupKey
			? { annualDiscountLookupKey: plan.annualDiscountLookupKey }
			: {}),
		...(plan.limits ? { limits: plan.limits } : {}),
		...(plan.group ? { group: plan.group } : {}),
		...(plan.seatPriceId ? { seatPriceId: plan.seatPriceId } : {}),
		...(plan.prorationBehavior ? { prorationBehavior: plan.prorationBehavior } : {}),
		...(plan.lineItems ? { lineItems: plan.lineItems } : {}),
		...(plan.freeTrialDays ? { freeTrial: { days: plan.freeTrialDays } } : {}),
	}));
}

/**
 * Build one secret-free catalog entry from a plan definition. `id` is attached
 * for single-product deeplink responses where the stored row id is known.
 * `prices`, keyed by Stripe price id, resolves the plan's primary and annual
 * amounts for display; ids that don't resolve are simply omitted.
 */
export function billingPlanCatalogEntry(
	plan: BillingPlanDefinition,
	id?: string,
	prices?: Record<string, CatalogPrice>,
): BillingPlanCatalogEntry {
	const price = plan.priceId ? prices?.[plan.priceId] : undefined;
	const annualPrice = plan.annualDiscountPriceId
		? prices?.[plan.annualDiscountPriceId]
		: undefined;
	return {
		...(id ? { id } : {}),
		name: plan.name.toLowerCase(),
		...(plan.label ? { label: plan.label } : {}),
		...(plan.description ? { description: plan.description } : {}),
		...(plan.group ? { group: plan.group } : {}),
		...(plan.limits ? { limits: plan.limits } : {}),
		entitlements: plan.entitlements ?? [],
		hasFreeTrial: Boolean(plan.freeTrialDays),
		hasAnnualDiscount: Boolean(plan.annualDiscountPriceId ?? plan.annualDiscountLookupKey),
		type: plan.type ?? "subscription",
		personalOnly: plan.personalOnly ?? false,
		hidden: plan.hidden ?? false,
		...(price ? { price } : {}),
		...(annualPrice ? { annualPrice } : {}),
	};
}

export function billingPlanCatalog(
	plans: readonly BillingPlanDefinition[],
	prices?: Record<string, CatalogPrice>,
): BillingPlanCatalog {
	return Object.fromEntries(
		plans.map((plan) => [plan.name.toLowerCase(), billingPlanCatalogEntry(plan, undefined, prices)]),
	);
}

/**
 * Collect the Stripe price ids worth resolving for a set of plans: each plan's
 * primary `priceId` and, when present, its `annualDiscountPriceId`. Lookup keys
 * are skipped since they can't be resolved by `prices.retrieve`.
 */
export function catalogPriceIds(plans: readonly BillingPlanDefinition[]): string[] {
	const ids = new Set<string>();
	for (const plan of plans) {
		if (plan.priceId) ids.add(plan.priceId);
		if (plan.annualDiscountPriceId) ids.add(plan.annualDiscountPriceId);
	}
	return [...ids];
}

export function stripeCheckoutDefaults(
	env: StripeCheckoutDefaultsEnv,
): StripeCheckoutDefaults {
	const billingAddressCollection = optionalEnv(
		env.STRIPE_CHECKOUT_BILLING_ADDRESS_COLLECTION,
	);
	if (
		billingAddressCollection &&
		billingAddressCollection !== "auto" &&
		billingAddressCollection !== "required"
	) {
		throw new TypeError(
			"STRIPE_CHECKOUT_BILLING_ADDRESS_COLLECTION must be auto or required.",
		);
	}

	return {
		...(parseOptionalBoolean(
			env.STRIPE_CHECKOUT_ALLOW_PROMOTION_CODES,
			"STRIPE_CHECKOUT_ALLOW_PROMOTION_CODES",
		) !== undefined
			? {
					allowPromotionCodes: parseOptionalBoolean(
						env.STRIPE_CHECKOUT_ALLOW_PROMOTION_CODES,
						"STRIPE_CHECKOUT_ALLOW_PROMOTION_CODES",
					),
				}
			: {}),
		...(parseOptionalBoolean(
			env.STRIPE_CHECKOUT_AUTOMATIC_TAX_ENABLED,
			"STRIPE_CHECKOUT_AUTOMATIC_TAX_ENABLED",
		) !== undefined
			? {
					automaticTaxEnabled: parseOptionalBoolean(
						env.STRIPE_CHECKOUT_AUTOMATIC_TAX_ENABLED,
						"STRIPE_CHECKOUT_AUTOMATIC_TAX_ENABLED",
					),
				}
			: {}),
		...(parseOptionalBoolean(
			env.STRIPE_CHECKOUT_TAX_ID_COLLECTION_ENABLED,
			"STRIPE_CHECKOUT_TAX_ID_COLLECTION_ENABLED",
		) !== undefined
			? {
					taxIDCollectionEnabled: parseOptionalBoolean(
						env.STRIPE_CHECKOUT_TAX_ID_COLLECTION_ENABLED,
						"STRIPE_CHECKOUT_TAX_ID_COLLECTION_ENABLED",
					),
				}
			: {}),
		...(billingAddressCollection
			? {
					billingAddressCollection: billingAddressCollection as
						| "auto"
						| "required",
				}
			: {}),
		...(optionalEnv(env.STRIPE_CHECKOUT_CUSTOM_TEXT_SUBMIT_MESSAGE)
			? {
					customTextSubmitMessage: optionalEnv(
						env.STRIPE_CHECKOUT_CUSTOM_TEXT_SUBMIT_MESSAGE,
					),
				}
			: {}),
	};
}
