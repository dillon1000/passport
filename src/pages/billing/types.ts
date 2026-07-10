/**
 * Shared types for the billing module: the public catalog response, the
 * admin-only plan record, registry entries, per-customer subscription and
 * purchase summaries, and the plan-editor draft used by the admin workspace.
 */
import type { BillingPlanCatalogEntry } from "@/lib/billing";

export type CatalogLabels = {
	entitlementLabels: Record<string, string>;
	limitLabels: Record<string, { name: string; unit?: string }>;
};

export type BillingPlanCatalogResponse = {
	plans: BillingPlanCatalogEntry[];
} & Partial<CatalogLabels>;

export type AdminBillingPlan = {
	id: string;
	name: string;
	label: string | null;
	description: string | null;
	group: string | null;
	priceId: string | null;
	lookupKey: string | null;
	annualDiscountPriceId: string | null;
	annualDiscountLookupKey: string | null;
	seatPriceId: string | null;
	prorationBehavior: string | null;
	freeTrialDays: number | null;
	type: string;
	personalOnly: boolean;
	hidden: boolean;
	displayOrder: number;
	limits: Record<string, unknown> | null;
	entitlements: string[] | null;
	lineItems: Record<string, unknown>[] | null;
};

export type EntitlementEntry = { id: string; key: string; name: string; description: string | null };
export type LimitEntry = { id: string; key: string; name: string; unit: string | null };
export type OAuthClientLite = { clientId: string; name: string };

export type SubscriptionSummary = {
	id: string;
	plan: string;
	status: string;
	referenceId: string;
	stripeSubscriptionId?: string | null;
	periodStart?: string | Date | null;
	periodEnd?: string | Date | null;
	trialStart?: string | Date | null;
	trialEnd?: string | Date | null;
	cancelAtPeriodEnd?: boolean | null;
	cancelAt?: string | Date | null;
	canceledAt?: string | Date | null;
	endedAt?: string | Date | null;
	seats?: number | null;
	billingInterval?: string | null;
	stripeScheduleId?: string | null;
	limits?: Record<string, unknown>;
};

export type PurchaseSummary = {
	id: string;
	plan: string;
	status: string;
	quantity: number;
	amountTotal: number | null;
	currency: string | null;
	purchasedAt?: string | Date | null;
	createdAt: string | Date;
};

export type OrganizationSummary = { id: string; name: string; slug: string; logo?: string | null };

export type CustomerType = "user" | "organization";
export type BillingTarget = { customerType: CustomerType; referenceId?: string };

/**
 * Editor state for provisioning a brand-new Stripe Product + Price(s) on create.
 * `enabled` gates the whole block; when off, the admin pastes existing price ids
 * instead. All amount fields are decimal major-unit strings (e.g. "29.99").
 */
export type StripeProductDraft = {
	enabled: boolean;
	productName: string;
	amount: string;
	currency: string;
	interval: "day" | "week" | "month" | "year";
	intervalCount: string;
	usageType: "" | "licensed" | "metered";
	nickname: string;
	lookupKey: string;
	taxBehavior: "" | "unspecified" | "inclusive" | "exclusive";
	statementDescriptor: string;
	unitLabel: string;
	taxCode: string;
	url: string;
	annualAmount: string;
	annualLookupKey: string;
	seatAmount: string;
	seatLookupKey: string;
};

export type PlanDraft = {
	name: string;
	label: string;
	description: string;
	group: string;
	priceId: string;
	lookupKey: string;
	annualDiscountPriceId: string;
	annualDiscountLookupKey: string;
	seatPriceId: string;
	prorationBehavior: string;
	freeTrialDays: string;
	type: "subscription" | "one_time";
	personalOnly: boolean;
	hidden: boolean;
	entitlements: string[];
	limits: Record<string, string>;
	stripe: StripeProductDraft;
};
