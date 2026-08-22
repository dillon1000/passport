/**
 * OAuth-safe billing claim builder. Inputs are local subscription rows plus the
 * public parts of `STRIPE_BILLING_PLANS`; outputs are product-level billing
 * status, entitlements, limits, and subscription summaries. Raw Stripe customer,
 * subscription, and schedule IDs are intentionally excluded from claims.
 */
import { z } from "zod";

import type { AuthEnv } from "../env";
import type { BillingLimits, BillingPlanCatalog } from "./billing";

type BillingClaimEnv = Pick<AuthEnv, "BETTER_AUTH_URL">;
const finiteLimitSchema = z.number().finite();

export type BillingCustomerType = "user" | "organization";

export type BillingSubscriptionClaimSource = {
	id: string;
	referenceId: string;
	customerType: BillingCustomerType;
	plan: string;
	status: string;
	periodStart?: Date | string | null;
	periodEnd?: Date | string | null;
	trialStart?: Date | string | null;
	trialEnd?: Date | string | null;
	cancelAtPeriodEnd?: boolean | null;
	cancelAt?: Date | string | null;
	canceledAt?: Date | string | null;
	endedAt?: Date | string | null;
	seats?: number | null;
	billingInterval?: string | null;
	stripeScheduleId?: string | null;
};

export type BillingPurchaseClaimSource = {
	id: string;
	referenceId: string;
	customerType: BillingCustomerType;
	plan: string;
	status: string;
	quantity?: number | null;
	amountTotal?: number | null;
	currency?: string | null;
	purchasedAt?: Date | string | null;
};

type BillingSubscriptionClaim = {
	id: string;
	referenceId: string;
	customerType: BillingCustomerType;
	plan: string;
	status: string;
	billingInterval?: string;
	seats?: number;
	periodStart?: string;
	periodEnd?: string;
	trialStart?: string;
	trialEnd?: string;
	cancelAtPeriodEnd: boolean;
	cancelAt?: string;
	canceledAt?: string;
	endedAt?: string;
	scheduledChange: boolean;
	limits?: BillingLimits;
	entitlements: readonly string[];
};

type BillingPurchaseClaim = {
	id: string;
	referenceId: string;
	customerType: BillingCustomerType;
	plan: string;
	status: string;
	quantity?: number;
	amountTotal?: number;
	currency?: string;
	purchasedAt?: string;
	limits?: BillingLimits;
	entitlements: readonly string[];
};

type BillingStatusClaim = {
	active: boolean;
	trialing: boolean;
	pastDue: boolean;
	canceled: boolean;
	activePlans: string[];
	plans: string[];
};

export type BillingScopeClaimValue =
	| BillingStatusClaim
	| BillingSubscriptionClaim[]
	| BillingPurchaseClaim[]
	| string[]
	| BillingLimits;

export type BillingScopeClaims = {
	[claimURL: string]: BillingScopeClaimValue;
};

function hasScope(scopes: readonly string[], scope: string) {
	return scopes.includes(scope);
}

function oauthClaimURL(env: BillingClaimEnv, name: string) {
	return new URL(`/claims/${name}`, env.BETTER_AUTH_URL).toString();
}

function optionalISODate(value: Date | string | null | undefined) {
	if (!value) return undefined;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function unique(values: readonly string[]) {
	return [...new Set(values)];
}

function isActiveStatus(status: string) {
	return status === "active" || status === "trialing";
}

// A one-time purchase grants its plan's entitlements and limits permanently;
// only refunds revoke them.
function isCompletedPurchase(status: string) {
	return status === "completed";
}

// Plan slugs that currently grant entitlements: active subscriptions plus
// completed one-time purchases.
function entitledPlanNames(
	subscriptions: readonly BillingSubscriptionClaimSource[],
	purchases: readonly BillingPurchaseClaimSource[],
) {
	return [
		...subscriptions
			.filter((subscription) => isActiveStatus(subscription.status))
			.map((subscription) => subscription.plan),
		...purchases
			.filter((purchase) => isCompletedPurchase(purchase.status))
			.map((purchase) => purchase.plan),
	];
}

function billingSubscriptionClaims(
	catalog: BillingPlanCatalog,
	subscriptions: readonly BillingSubscriptionClaimSource[],
) {
	return subscriptions.map((subscription) => {
		const catalogPlan = catalog[subscription.plan.toLowerCase()];
		const claim: BillingSubscriptionClaim = {
			id: subscription.id,
			referenceId: subscription.referenceId,
			customerType: subscription.customerType,
			plan: subscription.plan,
			status: subscription.status,
			cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
			scheduledChange: Boolean(subscription.stripeScheduleId),
			entitlements: catalogPlan?.entitlements ?? [],
		};
		if (subscription.billingInterval) claim.billingInterval = subscription.billingInterval;
		if (subscription.seats !== undefined && subscription.seats !== null) claim.seats = subscription.seats;
		const periodStart = optionalISODate(subscription.periodStart);
		if (periodStart) claim.periodStart = periodStart;
		const periodEnd = optionalISODate(subscription.periodEnd);
		if (periodEnd) claim.periodEnd = periodEnd;
		const trialStart = optionalISODate(subscription.trialStart);
		if (trialStart) claim.trialStart = trialStart;
		const trialEnd = optionalISODate(subscription.trialEnd);
		if (trialEnd) claim.trialEnd = trialEnd;
		const cancelAt = optionalISODate(subscription.cancelAt);
		if (cancelAt) claim.cancelAt = cancelAt;
		const canceledAt = optionalISODate(subscription.canceledAt);
		if (canceledAt) claim.canceledAt = canceledAt;
		const endedAt = optionalISODate(subscription.endedAt);
		if (endedAt) claim.endedAt = endedAt;
		if (catalogPlan?.limits) claim.limits = catalogPlan.limits;
		return claim;
	});
}

function billingPurchaseClaims(
	catalog: BillingPlanCatalog,
	purchases: readonly BillingPurchaseClaimSource[],
) {
	return purchases.map((purchase) => {
		const catalogPlan = catalog[purchase.plan.toLowerCase()];
		const claim: BillingPurchaseClaim = {
			id: purchase.id,
			referenceId: purchase.referenceId,
			customerType: purchase.customerType,
			plan: purchase.plan,
			status: purchase.status,
			entitlements: catalogPlan?.entitlements ?? [],
		};
		if (purchase.quantity !== undefined && purchase.quantity !== null) claim.quantity = purchase.quantity;
		if (purchase.amountTotal !== undefined && purchase.amountTotal !== null) claim.amountTotal = purchase.amountTotal;
		if (purchase.currency) claim.currency = purchase.currency;
		const purchasedAt = optionalISODate(purchase.purchasedAt);
		if (purchasedAt) claim.purchasedAt = purchasedAt;
		if (catalogPlan?.limits) claim.limits = catalogPlan.limits;
		return claim;
	});
}

function billingStatus(subscriptions: readonly BillingSubscriptionClaimSource[]): BillingStatusClaim {
	const plans = unique(subscriptions.map((subscription) => subscription.plan));
	const activePlans = unique(
		subscriptions
			.filter((subscription) => isActiveStatus(subscription.status))
			.map((subscription) => subscription.plan),
	);

	return {
		active: subscriptions.some((subscription) => subscription.status === "active"),
		trialing: subscriptions.some((subscription) => subscription.status === "trialing"),
		pastDue: subscriptions.some((subscription) => subscription.status === "past_due"),
		canceled: subscriptions.some((subscription) => subscription.status === "canceled"),
		activePlans,
		plans,
	};
}

function billingEntitlements(
	catalog: BillingPlanCatalog,
	planNames: readonly string[],
) {
	return unique(
		planNames.flatMap((plan) => catalog[plan.toLowerCase()]?.entitlements ?? []),
	);
}

function billingLimits(
	catalog: BillingPlanCatalog,
	planNames: readonly string[],
) {
	const merged: BillingLimits = {};
	for (const plan of planNames) {
		const limits = catalog[plan.toLowerCase()]?.limits;
		if (!limits) continue;
		for (const [key, value] of Object.entries(limits)) {
			const limit = finiteLimitSchema.safeParse(value);
			const current = finiteLimitSchema.safeParse(merged[key]);
			if (limit.success && current.success) {
				merged[key] = Math.max(limit.data, current.data);
				continue;
			}
			if (merged[key] === undefined) {
				merged[key] = value;
			}
		}
	}
	return merged;
}

export function buildBillingScopeClaims(
	env: BillingClaimEnv,
	scopes: readonly string[],
	subscriptions: readonly BillingSubscriptionClaimSource[],
	catalog: BillingPlanCatalog,
	purchases: readonly BillingPurchaseClaimSource[] = [],
) {
	const planNames = entitledPlanNames(subscriptions, purchases);
	const claims: BillingScopeClaims = {};
	if (hasScope(scopes, "billing:status")) claims[oauthClaimURL(env, "billing_status")] = billingStatus(subscriptions);
	if (hasScope(scopes, "billing:subscriptions")) claims[oauthClaimURL(env, "billing_subscriptions")] = billingSubscriptionClaims(catalog, subscriptions);
	if (hasScope(scopes, "billing:purchases")) claims[oauthClaimURL(env, "billing_purchases")] = billingPurchaseClaims(catalog, purchases);
	if (hasScope(scopes, "billing:entitlements")) claims[oauthClaimURL(env, "billing_entitlements")] = billingEntitlements(catalog, planNames);
	if (hasScope(scopes, "billing:limits")) claims[oauthClaimURL(env, "billing_limits")] = billingLimits(catalog, planNames);
	return claims;
}
