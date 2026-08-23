/**
 * D1-backed billing plan source. Inputs are the runtime env and auth
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
	type BillingPlanInput,
} from "./billing";
import type { AuthDatabase } from "./auth-server/types";

export type BillingPlanRow = typeof schema.billingPlan.$inferSelect;

function optionalText(value: string | null | undefined) {
	const normalized = value?.trim();
	return normalized || undefined;
}

/** Map a stored row to the shared BillingPlanDefinition shape. */
export function rowToDefinition(row: BillingPlanRow): BillingPlanDefinition {
	const input: BillingPlanInput = { name: row.name };
	const label = optionalText(row.label);
	const description = optionalText(row.description);
	const priceId = optionalText(row.priceId);
	const lookupKey = optionalText(row.lookupKey);
	const annualDiscountPriceId = optionalText(row.annualDiscountPriceId);
	const annualDiscountLookupKey = optionalText(row.annualDiscountLookupKey);
	const group = optionalText(row.group);
	const seatPriceId = optionalText(row.seatPriceId);
	const prorationBehavior = optionalText(row.prorationBehavior);
	if (label) input.label = label;
	if (description) input.description = description;
	if (priceId) input.priceId = priceId;
	if (lookupKey) input.lookupKey = lookupKey;
	if (annualDiscountPriceId) input.annualDiscountPriceId = annualDiscountPriceId;
	if (annualDiscountLookupKey) input.annualDiscountLookupKey = annualDiscountLookupKey;
	if (group) input.group = group;
	if (seatPriceId) input.seatPriceId = seatPriceId;
	if (prorationBehavior) input.prorationBehavior = prorationBehavior;
	if (row.freeTrialDays !== null) input.freeTrialDays = row.freeTrialDays;
	if (row.type !== "subscription") input.type = row.type;
	if (row.personalOnly) input.personalOnly = true;
	if (row.hidden) input.hidden = true;
	if (row.limits) input.limits = row.limits;
	if (row.entitlements) input.entitlements = row.entitlements;
	if (row.lineItems) input.lineItems = row.lineItems;
	return validateBillingPlanInput(input, `billing plan ${row.id}`);
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
		lineItems: plan.lineItems ?? null,
	};
}

export type BillingPlanInsert = ReturnType<typeof definitionToColumns> & {
	id: string;
	displayOrder: number;
};

export type BillingPlanStoreDependencies = {
	readRows?: () => Promise<BillingPlanRow[]>;
	insertPlan?: (input: BillingPlanInsert) => Promise<BillingPlanRow>;
};

async function readPlanRows(db: AuthDatabase | undefined, readRows?: () => Promise<BillingPlanRow[]>) {
	if (readRows) return readRows();
	if (!db) throw new TypeError("A database is required when no plan reader is supplied.");
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
	db: AuthDatabase | undefined,
	dependencies: BillingPlanStoreDependencies = {},
): Promise<BillingPlanDefinition[]> {
	const rows = await readPlanRows(db, dependencies.readRows);
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

export type BillingPlanWriteInput = BillingPlanInput & {
	displayOrder?: number;
};

function normalizeDisplayOrder(value: number | undefined) {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value < 0) {
		throw new TypeError("displayOrder must be a non-negative integer.");
	}
	return value;
}

export async function createBillingPlan(
	db: AuthDatabase | undefined,
	input: BillingPlanWriteInput,
	dependencies: BillingPlanStoreDependencies = {},
) {
	const plan = validateBillingPlanInput(input, "plan");
	const displayOrder = normalizeDisplayOrder(input.displayOrder) ?? 0;
	const columns: BillingPlanInsert = {
		id: newPlanId(),
		...definitionToColumns(plan),
		displayOrder,
	};
	if (dependencies.insertPlan) return dependencies.insertPlan(columns);
	if (!db) throw new TypeError("A database is required when no plan writer is supplied.");
	const [row] = await db
		.insert(schema.billingPlan)
		.values(columns)
		.returning();
	return row;
}


export async function updateBillingPlan(db: AuthDatabase, id: string, input: BillingPlanWriteInput) {
	const plan = validateBillingPlanInput(input, "plan");
	const displayOrder = normalizeDisplayOrder(input.displayOrder);
	const columns: ReturnType<typeof definitionToColumns> & { displayOrder?: number } =
		definitionToColumns(plan);
	if (displayOrder !== undefined) columns.displayOrder = displayOrder;
	const [row] = await db
		.update(schema.billingPlan)
		.set(columns)
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
export async function reorderBillingPlans(db: AuthDatabase, order: string[]) {
	await Promise.all(
	order.map((id, index) =>
			db
				.update(schema.billingPlan)
				.set({ displayOrder: index })
				.where(eq(schema.billingPlan.id, id)),
		),
	);
	return order.length;
}
