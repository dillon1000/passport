/**
 * Reusable billing registries. Inputs are the auth database and admin-supplied
 * registry rows; outputs are entitlement and limit definitions that plans
 * reference by key. Friendly names and units flow into the pricing table and the
 * public plan catalog so plans never have to redefine the same feature twice.
 */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import * as schema from "../db/schema";
import type { AuthDatabase } from "./auth-server/types";

export type BillingEntitlementRow = typeof schema.billingEntitlement.$inferSelect;
export type BillingLimitRow = typeof schema.billingLimit.$inferSelect;

export type BillingRegistryInput = {
	key: string;
	name: string;
	description?: string;
	unit?: string;
};

const billingRegistryInputSchema = z.object({
	key: z
		.string()
		.trim()
		.toLowerCase()
		.regex(/^[a-z0-9][a-z0-9_:-]*$/, "key must use lowercase letters, numbers, _, -, or :"),
	name: z.string().trim().min(1),
	description: z.string().trim().min(1).optional(),
	unit: z.string().trim().min(1).optional(),
});

/** Parse an admin registry write at the HTTP boundary before it reaches storage. */
export function parseBillingRegistryInput(value: unknown): BillingRegistryInput {
	const parsed = billingRegistryInputSchema.safeParse(value);
	if (!parsed.success) throw new TypeError(parsed.error.issues[0]?.message ?? "Invalid registry entry.");
	return parsed.data;
}

/** Decode an admin registry write before it reaches either database table. */
function normalizeBillingRegistryInput(input: BillingRegistryInput) {
	return parseBillingRegistryInput(input);
}

// --- Entitlements ---

export async function listEntitlements(db: AuthDatabase) {
	return db
		.select()
		.from(schema.billingEntitlement)
		.orderBy(asc(schema.billingEntitlement.name));
}

export async function createEntitlement(db: AuthDatabase, input: BillingRegistryInput) {
	const value = normalizeBillingRegistryInput(input);
	const [row] = await db
		.insert(schema.billingEntitlement)
		.values({
			id: crypto.randomUUID(),
			key: value.key,
			name: value.name,
			description: value.description ?? null,
		})
		.returning();
	return row;
}

export async function updateEntitlement(db: AuthDatabase, id: string, input: BillingRegistryInput) {
	const value = normalizeBillingRegistryInput(input);
	const [row] = await db
		.update(schema.billingEntitlement)
		.set({
			key: value.key,
			name: value.name,
			description: value.description ?? null,
		})
		.where(eq(schema.billingEntitlement.id, id))
		.returning();
	return row;
}

export async function deleteEntitlement(db: AuthDatabase, id: string) {
	const [row] = await db
		.delete(schema.billingEntitlement)
		.where(eq(schema.billingEntitlement.id, id))
		.returning();
	return row;
}

// --- Limits ---

export async function listLimits(db: AuthDatabase) {
	return db.select().from(schema.billingLimit).orderBy(asc(schema.billingLimit.name));
}

export async function createLimit(db: AuthDatabase, input: BillingRegistryInput) {
	const value = normalizeBillingRegistryInput(input);
	const [row] = await db
		.insert(schema.billingLimit)
		.values({
			id: crypto.randomUUID(),
			key: value.key,
			name: value.name,
			unit: value.unit ?? null,
		})
		.returning();
	return row;
}

export async function updateLimit(db: AuthDatabase, id: string, input: BillingRegistryInput) {
	const value = normalizeBillingRegistryInput(input);
	const [row] = await db
		.update(schema.billingLimit)
		.set({
			key: value.key,
			name: value.name,
			unit: value.unit ?? null,
		})
		.where(eq(schema.billingLimit.id, id))
		.returning();
	return row;
}

export async function deleteLimit(db: AuthDatabase, id: string) {
	const [row] = await db
		.delete(schema.billingLimit)
		.where(eq(schema.billingLimit.id, id))
		.returning();
	return row;
}

/** Friendly-name lookups for the public catalog and pricing table. */
export async function loadRegistryLabels(db: AuthDatabase) {
	const [entitlements, limits] = await Promise.all([
		listEntitlements(db),
		listLimits(db),
	]);
	return {
		entitlementLabels: Object.fromEntries(
			entitlements.map((entry) => [entry.key, entry.name]),
		),
		limitLabels: Object.fromEntries(
		limits.map((entry) => [entry.key, { name: entry.name, unit: entry.unit ?? undefined }]),
		),
	};
}
