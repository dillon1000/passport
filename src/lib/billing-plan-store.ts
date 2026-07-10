/**
 * Postgres-backed billing plan source. Inputs are the runtime env and auth
 * database; outputs are BillingPlanDefinition rows for the Stripe plugin, the
 * public plan catalog, and OAuth billing claims. When the `billing_plan` table
 * is empty the source falls back to `STRIPE_BILLING_PLANS`, so env-only
 * deployments keep working and the env var can seed the table.
 */
import { asc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import * as schema from "../db/schema";
import {
	parseStripeBillingPlans,
	validateBillingPlanInput,
	type BillingPlanDefinition,
} from "./billing";
import type { AuthDatabase } from "./auth-server/types";

type BillingPlanRow = typeof schema.billingPlan.$inferSelect;

function optionalText(value: string | null | undefined) {
	const normalized = value?.trim();
	return normalized || undefined;
}

/** Map a stored row to the shared BillingPlanDefinition shape. */
export function rowToDefinition(row: BillingPlanRow): BillingPlanDefinition {
	return {
		name: row.name,
		...(optionalText(row.label) ? { label: optionalText(row.label) } : {}),
		...(optionalText(row.description)
			? { description: optionalText(row.description) }
			: {}),
		...(optionalText(row.priceId) ? { priceId: optionalText(row.priceId) } : {}),
		...(optionalText(row.lookupKey) ? { lookupKey: optionalText(row.lookupKey) } : {}),
		...(optionalText(row.annualDiscountPriceId)
			? { annualDiscountPriceId: optionalText(row.annualDiscountPriceId) }
			: {}),
		...(optionalText(row.annualDiscountLookupKey)
			? { annualDiscountLookupKey: optionalText(row.annualDiscountLookupKey) }
			: {}),
		...(optionalText(row.group) ? { group: optionalText(row.group) } : {}),
		...(optionalText(row.seatPriceId)
			? { seatPriceId: optionalText(row.seatPriceId) }
			: {}),
		...(optionalText(row.prorationBehavior)
			? {
					prorationBehavior:
						row.prorationBehavior as BillingPlanDefinition["prorationBehavior"],
				}
			: {}),
		...(row.freeTrialDays != null ? { freeTrialDays: row.freeTrialDays } : {}),
		...(row.type && row.type !== "subscription"
			? { type: row.type as BillingPlanDefinition["type"] }
			: {}),
		...(row.personalOnly ? { personalOnly: true } : {}),
		...(row.hidden ? { hidden: true } : {}),
		...(row.limits ? { limits: row.limits } : {}),
		...(row.entitlements ? { entitlements: row.entitlements } : {}),
		...(row.lineItems
			? { lineItems: row.lineItems as BillingPlanDefinition["lineItems"] }
			: {}),
	};
}

/** Map a validated definition to column values for insert/update. */
function definitionToColumns(plan: BillingPlanDefinition) {
	return {
		name: plan.name.toLowerCase(),
		label: plan.label ?? null,
		description: plan.description ?? null,
		group: plan.group ?? null,
		priceId: plan.priceId ?? null,
		lookupKey: plan.lookupKey ?? null,
		annualDiscountPriceId: plan.annualDiscountPriceId ?? null,
		annualDiscountLookupKey: plan.annualDiscountLookupKey ?? null,
		seatPriceId: plan.seatPriceId ?? null,
		prorationBehavior: plan.prorationBehavior ?? null,
		freeTrialDays: plan.freeTrialDays ?? null,
		type: plan.type ?? "subscription",
		personalOnly: plan.personalOnly ?? false,
		hidden: plan.hidden ?? false,
		limits: plan.limits ?? null,
		entitlements: plan.entitlements ?? null,
		lineItems: (plan.lineItems as Record<string, unknown>[] | undefined) ?? null,
	};
}

async function readPlanRows(db: AuthDatabase) {
	return db
		.select()
		.from(schema.billingPlan)
		.orderBy(asc(schema.billingPlan.displayOrder), asc(schema.billingPlan.name));
}

/**
 * Resolve the active plan catalog. Reads the `billing_plan` table and falls
 * back to `STRIPE_BILLING_PLANS` when it holds no rows.
 */
export async function loadBillingPlans(
	env: { STRIPE_BILLING_PLANS?: string },
	db: AuthDatabase,
): Promise<BillingPlanDefinition[]> {
	const rows = await readPlanRows(db);
	if (rows.length === 0) {
		return parseStripeBillingPlans(env.STRIPE_BILLING_PLANS);
	}
	return rows.map(rowToDefinition);
}

/** Admin list: full plan rows including order metadata. */
export async function listBillingPlans(db: AuthDatabase) {
	return readPlanRows(db);
}

/** Look up a single stored plan by its `prod_…` id, for deeplink product pages. */
export async function getBillingPlanById(db: AuthDatabase, id: string) {
	const [row] = await db
		.select()
		.from(schema.billingPlan)
		.where(eq(schema.billingPlan.id, id))
		.limit(1);
	return row ?? null;
}

/** Stable, URL-safe plan id used in /billing/product/:id deeplinks. */
function newPlanId() {
	return `prod_${nanoid()}`;
}

export type BillingPlanWriteInput = {
	displayOrder?: number;
} & Record<string, unknown>;

function normalizeDisplayOrder(value: unknown) {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new TypeError("displayOrder must be a non-negative integer.");
	}
	return value;
}

export async function createBillingPlan(db: AuthDatabase, input: unknown) {
	const value = (input ?? {}) as Record<string, unknown>;
	const plan = validateBillingPlanInput(value, "plan");
	const displayOrder = normalizeDisplayOrder(value.displayOrder) ?? 0;
	const [row] = await db
		.insert(schema.billingPlan)
		.values({
			id: newPlanId(),
			...definitionToColumns(plan),
			displayOrder,
		})
		.returning();
	return row;
}

export async function updateBillingPlan(db: AuthDatabase, id: string, input: unknown) {
	const value = (input ?? {}) as Record<string, unknown>;
	const plan = validateBillingPlanInput(value, "plan");
	const displayOrder = normalizeDisplayOrder(value.displayOrder);
	const [row] = await db
		.update(schema.billingPlan)
		.set({
			...definitionToColumns(plan),
			...(displayOrder === undefined ? {} : { displayOrder }),
		})
		.where(eq(schema.billingPlan.id, id))
		.returning();
	return row;
}

export async function deleteBillingPlan(db: AuthDatabase, id: string) {
	const [row] = await db
		.delete(schema.billingPlan)
		.where(eq(schema.billingPlan.id, id))
		.returning();
	return row;
}

// Persist a drag-to-reorder result: each plan's displayOrder becomes its index
// in the supplied id list. Ids not present are left untouched.
export async function reorderBillingPlans(db: AuthDatabase, order: unknown) {
	if (!Array.isArray(order) || order.some((id) => typeof id !== "string")) {
		throw new TypeError("order must be an array of plan ids.");
	}
	const ids = order as string[];
	await Promise.all(
		ids.map((id, index) =>
			db
				.update(schema.billingPlan)
				.set({ displayOrder: index })
				.where(eq(schema.billingPlan.id, id)),
		),
	);
	return ids.length;
}
