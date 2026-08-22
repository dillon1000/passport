/**
 * Stripe billing configuration helpers. Inputs are deployment environment
 * values, especially `STRIPE_BILLING_PLANS`; outputs are Better Auth Stripe
 * plan objects for the server plugin plus a secret-free plan catalog for UI and
 * OAuth claims. Safe configuration points are plan JSON, checkout defaults, and
 * Stripe API version env values.
 */
import type { StripePlan } from "@better-auth/stripe";
import { z } from "zod";

import { optionalEnv, parseOptionalBoolean } from "./auth-server/env";

export const DEFAULT_STRIPE_API_VERSION = "2026-07-29.dahlia";

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

/** A plan limit is either a numeric quota or its explicit text value. */
export type BillingLimitValue = number | string;
export type BillingLimits = { [key: string]: BillingLimitValue };

/** Stored Stripe line items support the price-based checkout path this app exposes. */
export type BillingPlanLineItem = {
	price: string;
	quantity?: number;
};

export type BillingPlanDefinition = {
	name: string;
	label?: string;
	description?: string;
	priceId?: string;
	lookupKey?: string;
	annualDiscountPriceId?: string;
	annualDiscountLookupKey?: string;
	limits?: BillingLimits;
	entitlements?: string[];
	group?: string;
	seatPriceId?: string;
	prorationBehavior?: StripeProrationBehavior;
	lineItems?: BillingPlanLineItem[];
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
	limits?: BillingLimits;
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

export type BillingPlanInput = {
	name?: string;
	label?: string;
	description?: string;
	priceId?: string;
	lookupKey?: string;
	annualDiscountPriceId?: string;
	annualDiscountLookupKey?: string;
	limits?: BillingLimits;
	entitlements?: string[];
	group?: string;
	seatPriceId?: string;
	prorationBehavior?: string;
	lineItems?: BillingPlanLineItem[];
	freeTrialDays?: number;
	type?: string;
	personalOnly?: boolean;
	hidden?: boolean;
};

export type StripeProductInput = Omit<StripeProductProvisionInput, "amount"> & {
	amount: number | string;
	annualAmount?: number | string;
	seatAmount?: number | string;
	interval?: string;
	usageType?: string;
	taxBehavior?: string;
};

const optionalText = z.string().trim().min(1).optional();
const billingLimitSchema = z.union([z.string(), z.number()]);
const billingPlanInputSchema = z.object({
	name: z.string().trim().min(1),
	label: optionalText,
	description: optionalText,
	priceId: optionalText,
	lookupKey: optionalText,
	annualDiscountPriceId: optionalText,
	annualDiscountLookupKey: optionalText,
	limits: z.record(z.string(), billingLimitSchema).optional(),
	entitlements: z.array(z.string().trim().min(1)).optional(),
	group: optionalText,
	seatPriceId: optionalText,
	prorationBehavior: z.enum(STRIPE_PRORATION_BEHAVIORS).optional(),
	lineItems: z
		.array(
			z.object({
				price: z.string().trim().min(1),
				quantity: z.number().int().min(1).optional(),
			}),
		)
		.optional(),
	freeTrialDays: z.number().int().nonnegative().optional(),
	type: z.enum(BILLING_PLAN_TYPES).optional(),
	personalOnly: z.boolean().optional(),
	hidden: z.boolean().optional(),
});

const billingPlanWriteInputSchema = billingPlanInputSchema.extend({
	displayOrder: z.number().int().nonnegative().optional(),
});

const stripeAmountSchema = z
	.union([z.number(), z.string().trim().min(1).transform(Number)])
	.pipe(z.number().finite().nonnegative());
const stripeProductInputSchema = z.object({
	productName: optionalText,
	description: optionalText,
	statementDescriptor: optionalText,
	unitLabel: optionalText,
	taxCode: optionalText,
	url: optionalText,
	amount: stripeAmountSchema,
	currency: z.string().trim().regex(/^[a-z]{3}$/i).transform((value) => value.toLowerCase()),
	interval: z.enum(STRIPE_PRICE_INTERVALS).optional(),
	intervalCount: z.number().int().nonnegative().optional(),
	usageType: z.enum(STRIPE_USAGE_TYPES).optional(),
	nickname: optionalText,
	lookupKey: optionalText,
	taxBehavior: z.enum(STRIPE_TAX_BEHAVIORS).optional(),
	annualAmount: stripeAmountSchema.optional(),
	annualLookupKey: optionalText,
	seatAmount: stripeAmountSchema.optional(),
	seatLookupKey: optionalText,
});

/**
 * Validate and normalize a single plan object into a BillingPlanDefinition.
 * `label` prefixes error messages so callers can point at the offending source
 * (`STRIPE_BILLING_PLANS[2]` for env parsing, `plan` for admin DB writes).
 */
export function validateBillingPlanInput(
	value: BillingPlanInput,
	label: string,
): BillingPlanDefinition {
	const parsed = billingPlanInputSchema.safeParse(value);
	if (!parsed.success) throw new TypeError(`${label}: ${parsed.error.issues[0]?.message ?? "is invalid"}.`);
	if (!parsed.data.priceId && !parsed.data.lookupKey) {
		throw new TypeError(`${label} must define priceId or lookupKey.`);
	}
	return parsed.data;
}

/** Parse an admin plan write at the HTTP boundary before it reaches storage. */
export function parseBillingPlanWriteInput(value: unknown): BillingPlanInput & { displayOrder?: number } {
	const parsed = billingPlanWriteInputSchema.safeParse(value);
	if (!parsed.success) throw new TypeError(parsed.error.issues[0]?.message ?? "Invalid billing plan.");
	return parsed.data;
}

/**
 * Validate and normalize an admin request to create a new Stripe Product and
 * Price(s). `label` prefixes error messages. `amount`/`annualAmount`/`seatAmount`
 * are decimal major units; the Stripe provisioner converts them to minor units.
 */
export function validateStripeProductInput(
	value: StripeProductInput,
	label: string,
): StripeProductProvisionInput {
	const parsed = stripeProductInputSchema.safeParse(value);
	if (!parsed.success) throw new TypeError(`${label}: ${parsed.error.issues[0]?.message ?? "is invalid"}.`);
	return parsed.data;
}

export function parseStripeBillingPlans(value: string | undefined) {
	const raw = optionalEnv(value);
	if (!raw) return [];
	const decoded: unknown = JSON.parse(raw);
	const parsed = z.array(billingPlanInputSchema).safeParse(decoded);
	if (!parsed.success) {
		throw new TypeError("STRIPE_BILLING_PLANS must be a JSON array.");
	}
	return parsed.data.map((plan, index) =>
		validateBillingPlanInput(plan, `STRIPE_BILLING_PLANS[${index}]`),
	);
}

export function stripePlansFromBillingPlans(
	plans: readonly BillingPlanDefinition[],
): StripePlan[] {
	return plans.map((plan) => {
		const stripePlan: StripePlan = { name: plan.name };
		if (plan.priceId) stripePlan.priceId = plan.priceId;
		if (plan.lookupKey) stripePlan.lookupKey = plan.lookupKey;
		if (plan.annualDiscountPriceId) stripePlan.annualDiscountPriceId = plan.annualDiscountPriceId;
		if (plan.annualDiscountLookupKey) {
			stripePlan.annualDiscountLookupKey = plan.annualDiscountLookupKey;
		}
		if (plan.limits) stripePlan.limits = plan.limits;
		if (plan.group) stripePlan.group = plan.group;
		if (plan.seatPriceId) stripePlan.seatPriceId = plan.seatPriceId;
		if (plan.prorationBehavior) stripePlan.prorationBehavior = plan.prorationBehavior;
		if (plan.lineItems) stripePlan.lineItems = plan.lineItems;
		if (plan.freeTrialDays !== undefined) stripePlan.freeTrial = { days: plan.freeTrialDays };
		return stripePlan;
	});
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
	const entry: BillingPlanCatalogEntry = {
		name: plan.name.toLowerCase(),
		entitlements: plan.entitlements ?? [],
		hasFreeTrial: Boolean(plan.freeTrialDays),
		hasAnnualDiscount: Boolean(plan.annualDiscountPriceId ?? plan.annualDiscountLookupKey),
		type: plan.type ?? "subscription",
		personalOnly: plan.personalOnly ?? false,
		hidden: plan.hidden ?? false,
	};
	if (id) entry.id = id;
	if (plan.label) entry.label = plan.label;
	if (plan.description) entry.description = plan.description;
	if (plan.group) entry.group = plan.group;
	if (plan.limits) entry.limits = plan.limits;
	if (price) entry.price = price;
	if (annualPrice) entry.annualPrice = annualPrice;
	return entry;
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
	const billingAddressCollection = z
		.enum(["auto", "required"])
		.optional()
		.safeParse(optionalEnv(env.STRIPE_CHECKOUT_BILLING_ADDRESS_COLLECTION));
	if (!billingAddressCollection.success) {
		throw new TypeError(
			"STRIPE_CHECKOUT_BILLING_ADDRESS_COLLECTION must be auto or required.",
		);
	}
	const defaults: StripeCheckoutDefaults = {};
	const allowPromotionCodes = parseOptionalBoolean(
		env.STRIPE_CHECKOUT_ALLOW_PROMOTION_CODES,
		"STRIPE_CHECKOUT_ALLOW_PROMOTION_CODES",
	);
	const automaticTaxEnabled = parseOptionalBoolean(
		env.STRIPE_CHECKOUT_AUTOMATIC_TAX_ENABLED,
		"STRIPE_CHECKOUT_AUTOMATIC_TAX_ENABLED",
	);
	const taxIDCollectionEnabled = parseOptionalBoolean(
		env.STRIPE_CHECKOUT_TAX_ID_COLLECTION_ENABLED,
		"STRIPE_CHECKOUT_TAX_ID_COLLECTION_ENABLED",
	);
	const customTextSubmitMessage = optionalEnv(env.STRIPE_CHECKOUT_CUSTOM_TEXT_SUBMIT_MESSAGE);
	if (allowPromotionCodes !== undefined) defaults.allowPromotionCodes = allowPromotionCodes;
	if (automaticTaxEnabled !== undefined) defaults.automaticTaxEnabled = automaticTaxEnabled;
	if (taxIDCollectionEnabled !== undefined) defaults.taxIDCollectionEnabled = taxIDCollectionEnabled;
	if (billingAddressCollection.data) defaults.billingAddressCollection = billingAddressCollection.data;
	if (customTextSubmitMessage) defaults.customTextSubmitMessage = customTextSubmitMessage;
	return defaults;
}
