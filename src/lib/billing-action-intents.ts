/**
 * Durable delegated-billing handoffs. OAuth clients can create a short-lived
 * intent, but Stripe is contacted only after the same Passport user confirms
 * it with a browser session. Inputs are validated client registrations and an
 * actor-owned billing target; outputs are replay-safe public intent summaries.
 */
import { and, eq, gt, lte, or } from "drizzle-orm";

import * as schema from "../db/schema";
import type { AuthDatabase } from "./auth-server/types";

export const BILLING_ACTIONS = [
	"checkout",
	"portal",
	"cancel_subscription",
	"restore_subscription",
] as const;

export type BillingAction = (typeof BILLING_ACTIONS)[number];

export type BillingIntentClient = {
	clientId: string;
	redirectUris: readonly string[];
	postLogoutRedirectUris?: readonly string[] | null;
	uri?: string | null;
};

export type CreateBillingActionIntentInput = {
	userId: string;
	client: BillingIntentClient;
	action: BillingAction;
	organizationId?: string;
	productId?: string;
	subscriptionId?: string;
	annual?: boolean;
	seats?: number;
	successUrl?: string;
	cancelUrl?: string;
	returnUrl?: string;
	idempotencyKey: string;
};

export type BillingActionIntentSummary = {
	id: string;
	action: BillingAction;
	status: string;
	expiresAt: string;
	handoffUrl: string;
};

export type BillingActionIntentCreation = BillingActionIntentSummary & {
	/** Internal audit hint; API responses omit this implementation detail. */
	wasCreated: boolean;
};

export class BillingActionIntentError extends Error {
	readonly code:
		| "invalid_request"
		| "invalid_return_url"
		| "idempotency_conflict"
		| "intent_not_found"
		| "intent_expired"
		| "intent_in_progress";

	constructor(
		code:
			| "invalid_request"
			| "invalid_return_url"
			| "idempotency_conflict"
			| "intent_not_found"
			| "intent_expired"
			| "intent_in_progress",
		message: string,
	) {
		super(message);
		this.name = "BillingActionIntentError";
		this.code = code;
	}
}

function loopbackHostname(hostname: string) {
	return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function parsedURL(value: string, label: string) {
	try {
		return new URL(value);
	} catch {
		throw new BillingActionIntentError(
			"invalid_return_url",
			`${label} must be an absolute URL.`,
		);
	}
}

/**
 * Callback authorization is intentionally origin-based: clients may choose a
 * path and query string, but cannot hand Passport an unregistered destination.
 * Plain HTTP is accepted only for a registered loopback development origin.
 */
export function validateBillingReturnURLs(
	client: BillingIntentClient,
	values: ReadonlyArray<{ label: string; value: string | undefined }>,
) {
	const registrationValues = [
		...client.redirectUris,
		...(client.postLogoutRedirectUris ?? []),
		...(client.uri ? [client.uri] : []),
	];
	const registeredOrigins = new Set(
		registrationValues.flatMap((value) => {
			try {
				return [new URL(value).origin];
			} catch {
				return [];
			}
		}),
	);
	const accepted: string[] = [];

	for (const { label, value } of values) {
		if (!value) continue;
		const url = parsedURL(value, label);
		if (!registeredOrigins.has(url.origin)) {
			throw new BillingActionIntentError(
				"invalid_return_url",
				`${label} must use an origin registered by the OAuth client.`,
			);
		}
		if (url.protocol !== "https:" && !(url.protocol === "http:" && loopbackHostname(url.hostname))) {
			throw new BillingActionIntentError(
				"invalid_return_url",
				`${label} must use HTTPS unless it is a registered loopback URL.`,
			);
		}
		accepted.push(url.toString());
	}

	return accepted;
}

function sortedJSON(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(sortedJSON).join(",")}]`;
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${sortedJSON(record[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

export async function billingIntentRequestHash(value: unknown) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(sortedJSON(value)),
	);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertActionInput(input: CreateBillingActionIntentInput) {
	if (input.action === "checkout") {
		if (!input.productId || !input.successUrl || !input.cancelUrl) {
			throw new BillingActionIntentError(
				"invalid_request",
				"Checkout intents require productId, successUrl, and cancelUrl.",
			);
		}
		return;
	}
	if (input.action === "portal") {
		if (!input.returnUrl) {
			throw new BillingActionIntentError("invalid_request", "Portal intents require returnUrl.");
		}
		return;
	}
	if (!input.subscriptionId || !input.returnUrl) {
		throw new BillingActionIntentError(
			"invalid_request",
			"Subscription action intents require subscriptionId and returnUrl.",
		);
	}
}

function summary(
	intent: typeof schema.billingActionIntent.$inferSelect,
	passportOrigin: string,
): BillingActionIntentSummary {
	return {
		id: intent.id,
		action: intent.action as BillingAction,
		status: intent.status,
		expiresAt: intent.expiresAt.toISOString(),
		handoffUrl: new URL(`/billing/action/${encodeURIComponent(intent.id)}`, passportOrigin).toString(),
	};
}

/** Create or replay a 15-minute billing action intent. */
export async function createBillingActionIntent(
	db: AuthDatabase,
	passportOrigin: string,
	input: CreateBillingActionIntentInput,
	now = new Date(),
) {
	assertActionInput(input);
	const registeredReturnUrls = validateBillingReturnURLs(input.client, [
		{ label: "successUrl", value: input.successUrl },
		{ label: "cancelUrl", value: input.cancelUrl },
		{ label: "returnUrl", value: input.returnUrl },
	]);
	const payload = {
		action: input.action,
		organizationId: input.organizationId ?? null,
		productId: input.productId ?? null,
		subscriptionId: input.subscriptionId ?? null,
		annual: input.annual ?? false,
		seats: input.seats ?? null,
		successUrl: input.successUrl ?? null,
		cancelUrl: input.cancelUrl ?? null,
		returnUrl: input.returnUrl ?? null,
	};
	const hash = await billingIntentRequestHash(payload);
	const values: typeof schema.billingActionIntent.$inferInsert = {
		id: crypto.randomUUID(),
		userId: input.userId,
		clientId: input.client.clientId,
		action: input.action,
		customerType: input.organizationId ? "organization" : "user",
		referenceId: input.organizationId ?? input.userId,
		productId: input.productId,
		subscriptionId: input.subscriptionId,
		annual: input.annual,
		seats: input.seats,
		successUrl: input.successUrl,
		cancelUrl: input.cancelUrl,
		returnUrl: input.returnUrl,
		registeredReturnUrls,
		idempotencyKey: input.idempotencyKey,
		requestHash: hash,
		status: "pending",
		createdAt: now,
		updatedAt: now,
		expiresAt: new Date(now.getTime() + 15 * 60 * 1_000),
	};

	const [created] = await db
		.insert(schema.billingActionIntent)
		.values(values)
		.onConflictDoNothing({
			target: [
				schema.billingActionIntent.clientId,
				schema.billingActionIntent.idempotencyKey,
			],
		})
		.returning();
	if (created) return { ...summary(created, passportOrigin), wasCreated: true };

	const [existing] = await db
		.select()
		.from(schema.billingActionIntent)
		.where(
			and(
				eq(schema.billingActionIntent.clientId, input.client.clientId),
				eq(schema.billingActionIntent.idempotencyKey, input.idempotencyKey),
			),
		)
		.limit(1);
	if (!existing || existing.userId !== input.userId || existing.requestHash !== hash) {
		throw new BillingActionIntentError(
			"idempotency_conflict",
			"Idempotency-Key was already used with a different request.",
		);
	}
	return { ...summary(existing, passportOrigin), wasCreated: false };
}

export async function getBillingActionIntent(db: AuthDatabase, id: string, userId: string) {
	const [intent] = await db
		.select()
		.from(schema.billingActionIntent)
		.where(
			and(eq(schema.billingActionIntent.id, id), eq(schema.billingActionIntent.userId, userId)),
		)
		.limit(1);
	if (!intent) {
		throw new BillingActionIntentError("intent_not_found", "Billing action not found.");
	}
	return intent;
}

/**
 * Claim a pending intent before contacting Stripe. Completed rows replay their
 * stored result; a concurrent claim is rejected so the action executes once.
 */
export async function claimBillingActionIntent(
	db: AuthDatabase,
	id: string,
	userId: string,
	now = new Date(),
) {
	const current = await getBillingActionIntent(db, id, userId);
	if (current.status === "completed") return current;
	if (current.expiresAt <= now) {
		throw new BillingActionIntentError("intent_expired", "This billing action has expired.");
	}
	const [claimed] = await db
		.update(schema.billingActionIntent)
		.set({ status: "processing", updatedAt: now })
		.where(
			and(
				eq(schema.billingActionIntent.id, id),
				eq(schema.billingActionIntent.userId, userId),
				eq(schema.billingActionIntent.status, "pending"),
				gt(schema.billingActionIntent.expiresAt, now),
			),
		)
		.returning();
	if (!claimed) {
		throw new BillingActionIntentError(
			"intent_in_progress",
			"This billing action is already being processed.",
		);
	}
	return claimed;
}

export async function completeBillingActionIntent(
	db: AuthDatabase,
	id: string,
	resultUrl: string | null,
	now = new Date(),
) {
	const [completed] = await db
		.update(schema.billingActionIntent)
		.set({ status: "completed", resultUrl, completedAt: now, updatedAt: now })
		.where(
			and(
				eq(schema.billingActionIntent.id, id),
				eq(schema.billingActionIntent.status, "processing"),
			),
		)
		.returning();
	if (!completed) {
		throw new BillingActionIntentError("intent_in_progress", "Billing action state changed.");
	}
	return completed;
}

export async function releaseBillingActionIntent(db: AuthDatabase, id: string, now = new Date()) {
	await db
		.update(schema.billingActionIntent)
		.set({ status: "pending", updatedAt: now })
		.where(
			and(
				eq(schema.billingActionIntent.id, id),
				eq(schema.billingActionIntent.status, "processing"),
				gt(schema.billingActionIntent.expiresAt, now),
			),
		);
}

/** Marks an attempted Stripe action terminal so a retry cannot execute it twice. */
export async function failBillingActionIntent(db: AuthDatabase, id: string, now = new Date()) {
	await db
		.update(schema.billingActionIntent)
		.set({ status: "failed", updatedAt: now })
		.where(
			and(
				eq(schema.billingActionIntent.id, id),
				eq(schema.billingActionIntent.status, "processing"),
			),
		);
}

/** Delete completed or expired handoffs after their 24-hour replay window. */
export async function cleanupBillingActionIntents(db: AuthDatabase, now = new Date()) {
	const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
	return db
		.delete(schema.billingActionIntent)
		.where(
			or(
				lte(schema.billingActionIntent.expiresAt, cutoff),
				and(
					eq(schema.billingActionIntent.status, "completed"),
					lte(schema.billingActionIntent.completedAt, cutoff),
				),
			),
		);
}
