/**
 * OAuth-safe billing claim builder. Inputs are local subscription rows plus the
 * public parts of `STRIPE_BILLING_PLANS`; outputs are product-level billing
 * status, entitlements, limits, and subscription summaries. Raw Stripe customer,
 * subscription, and schedule IDs are intentionally excluded from claims.
 */
import type { AuthEnv } from "../env";
import type { BillingPlanCatalog } from "./billing";

type BillingClaimEnv = Pick<AuthEnv, "BETTER_AUTH_URL">;

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
		return {
			id: subscription.id,
			referenceId: subscription.referenceId,
			customerType: subscription.customerType,
			plan: subscription.plan,
			status: subscription.status,
			...(subscription.billingInterval
				? { billingInterval: subscription.billingInterval }
				: {}),
			...(subscription.seats === undefined || subscription.seats === null
				? {}
				: { seats: subscription.seats }),
			...(optionalISODate(subscription.periodStart)
				? { periodStart: optionalISODate(subscription.periodStart) }
				: {}),
			...(optionalISODate(subscription.periodEnd)
				? { periodEnd: optionalISODate(subscription.periodEnd) }
				: {}),
			...(optionalISODate(subscription.trialStart)
				? { trialStart: optionalISODate(subscription.trialStart) }
				: {}),
			...(optionalISODate(subscription.trialEnd)
				? { trialEnd: optionalISODate(subscription.trialEnd) }
				: {}),
			cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
			...(optionalISODate(subscription.cancelAt)
				? { cancelAt: optionalISODate(subscription.cancelAt) }
				: {}),
			...(optionalISODate(subscription.canceledAt)
				? { canceledAt: optionalISODate(subscription.canceledAt) }
				: {}),
			...(optionalISODate(subscription.endedAt)
				? { endedAt: optionalISODate(subscription.endedAt) }
				: {}),
			scheduledChange: Boolean(subscription.stripeScheduleId),
			...(catalogPlan?.limits ? { limits: catalogPlan.limits } : {}),
			entitlements: catalogPlan?.entitlements ?? [],
		};
	});
}

function billingPurchaseClaims(
	catalog: BillingPlanCatalog,
	purchases: readonly BillingPurchaseClaimSource[],
) {
	return purchases.map((purchase) => {
		const catalogPlan = catalog[purchase.plan.toLowerCase()];
		return {
			id: purchase.id,
			referenceId: purchase.referenceId,
			customerType: purchase.customerType,
			plan: purchase.plan,
			status: purchase.status,
			...(purchase.quantity === undefined || purchase.quantity === null
				? {}
				: { quantity: purchase.quantity }),
			...(purchase.amountTotal === undefined || purchase.amountTotal === null
				? {}
				: { amountTotal: purchase.amountTotal }),
			...(purchase.currency ? { currency: purchase.currency } : {}),
			...(optionalISODate(purchase.purchasedAt)
				? { purchasedAt: optionalISODate(purchase.purchasedAt) }
				: {}),
			...(catalogPlan?.limits ? { limits: catalogPlan.limits } : {}),
			entitlements: catalogPlan?.entitlements ?? [],
		};
	});
}

function billingStatus(subscriptions: readonly BillingSubscriptionClaimSource[]) {
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
	const merged: Record<string, unknown> = {};
	for (const plan of planNames) {
		const limits = catalog[plan.toLowerCase()]?.limits;
		if (!limits) continue;
		for (const [key, value] of Object.entries(limits)) {
			if (
				typeof value === "number" &&
				typeof merged[key] === "number" &&
				Number.isFinite(value) &&
				Number.isFinite(merged[key])
			) {
				merged[key] = Math.max(merged[key], value);
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
): Record<string, unknown> {
	const planNames = entitledPlanNames(subscriptions, purchases);
	return {
		...(hasScope(scopes, "billing:status")
			? { [oauthClaimURL(env, "billing_status")]: billingStatus(subscriptions) }
			: {}),
		...(hasScope(scopes, "billing:subscriptions")
			? {
					[oauthClaimURL(env, "billing_subscriptions")]:
						billingSubscriptionClaims(catalog, subscriptions),
				}
			: {}),
		...(hasScope(scopes, "billing:purchases")
			? {
					[oauthClaimURL(env, "billing_purchases")]: billingPurchaseClaims(
						catalog,
						purchases,
					),
				}
			: {}),
		...(hasScope(scopes, "billing:entitlements")
			? {
					[oauthClaimURL(env, "billing_entitlements")]: billingEntitlements(
						catalog,
						planNames,
					),
				}
			: {}),
		...(hasScope(scopes, "billing:limits")
			? { [oauthClaimURL(env, "billing_limits")]: billingLimits(catalog, planNames) }
			: {}),
	};
}
