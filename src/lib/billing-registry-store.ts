/**
 * Reusable billing registries. Inputs are the auth database and admin-supplied
 * registry rows; outputs are entitlement and limit definitions that plans
 * reference by key. Friendly names and units flow into the pricing table and the
 * public plan catalog so plans never have to redefine the same feature twice.
 */
import { asc, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import type { AuthDatabase } from "./auth-server/types";

export type BillingEntitlementRow = typeof schema.billingEntitlement.$inferSelect;
export type BillingLimitRow = typeof schema.billingLimit.$inferSelect;

function requiredKey(value: unknown): string {
	const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
	if (!normalized) {
		throw new TypeError("key is required.");
	}
	if (!/^[a-z0-9][a-z0-9_:-]*$/.test(normalized)) {
		throw new TypeError(
			"key must be lowercase alphanumerics with _, -, or : separators.",
		);
	}
	return normalized;
}

function requiredName(value: unknown): string {
	const normalized = typeof value === "string" ? value.trim() : "";
	if (!normalized) {
		throw new TypeError("name is required.");
	}
	return normalized;
}

function optionalText(value: unknown): string | undefined {
	const normalized = typeof value === "string" ? value.trim() : "";
	return normalized || undefined;
}

// --- Entitlements ---

export async function listEntitlements(db: AuthDatabase) {
	return db
		.select()
		.from(schema.billingEntitlement)
		.orderBy(asc(schema.billingEntitlement.name));
}

export async function createEntitlement(db: AuthDatabase, input: unknown) {
	const value = (input ?? {}) as Record<string, unknown>;
	const [row] = await db
		.insert(schema.billingEntitlement)
		.values({
			id: crypto.randomUUID(),
			key: requiredKey(value.key),
			name: requiredName(value.name),
			description: optionalText(value.description) ?? null,
		})
		.returning();
	return row;
}

export async function updateEntitlement(db: AuthDatabase, id: string, input: unknown) {
	const value = (input ?? {}) as Record<string, unknown>;
	const [row] = await db
		.update(schema.billingEntitlement)
		.set({
			key: requiredKey(value.key),
			name: requiredName(value.name),
			description: optionalText(value.description) ?? null,
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

export async function createLimit(db: AuthDatabase, input: unknown) {
	const value = (input ?? {}) as Record<string, unknown>;
	const [row] = await db
		.insert(schema.billingLimit)
		.values({
			id: crypto.randomUUID(),
			key: requiredKey(value.key),
			name: requiredName(value.name),
			unit: optionalText(value.unit) ?? null,
		})
		.returning();
	return row;
}

export async function updateLimit(db: AuthDatabase, id: string, input: unknown) {
	const value = (input ?? {}) as Record<string, unknown>;
	const [row] = await db
		.update(schema.billingLimit)
		.set({
			key: requiredKey(value.key),
			name: requiredName(value.name),
			unit: optionalText(value.unit) ?? null,
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
			limits.map((entry) => [
				entry.key,
				{ name: entry.name, ...(entry.unit ? { unit: entry.unit } : {}) },
			]),
		),
	};
}
