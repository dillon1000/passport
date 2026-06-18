/**
 * Outbound webhook taxonomy, signing, and target validation. Inputs are
 * identity lifecycle events raised by the auth layer and operator mutations;
 * outputs are stable event-type slugs, a Workers-safe HMAC-SHA256 signature, and
 * an SSRF guard for subscriber URLs.
 *
 * Security: signing uses `crypto.subtle` (no Node crypto — this runs on the
 * Workers runtime). Endpoint secrets are generated here and shown to the
 * operator once; only a hash is stored (see worker subscription service).
 * Payloads must never carry secrets, tokens, OTPs, or password material.
 *
 * Event-type slugs are intentionally shared with the account activity log
 * (`account-activity.ts`) where they overlap (e.g. account linking) so one
 * identity event is named identically across the activity feed and webhooks.
 */

import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import type { createDb } from "../db/client";
import type { AuthEnv } from "../env";
import { type WebhookEventType } from "./webhook-events";

export {
	WEBHOOK_EVENT_TYPES,
	WEBHOOK_EVENT_TYPE_VALUES,
	isWebhookEventType,
	type WebhookEventType,
} from "./webhook-events";

/** Workflow input: identifies the single delivery row to attempt. */
export type WebhookDeliveryWorkflowPayload = {
	deliveryId: string;
};

/** The signed JSON envelope delivered to subscribers. */
export type WebhookEventPayload = {
	/** Stable per-delivery id; subscribers use it to dedupe retries. */
	id: string;
	type: WebhookEventType;
	/** ISO-8601 creation time of the event. */
	createdAt: string;
	/** Event-specific, secret-free data. */
	data: Record<string, unknown>;
};

const HEX = Array.from({ length: 256 }, (_, index) =>
	index.toString(16).padStart(2, "0"),
);

function toHex(buffer: ArrayBuffer) {
	const bytes = new Uint8Array(buffer);
	let out = "";
	for (const byte of bytes) out += HEX[byte];
	return out;
}

/**
 * Computes the lowercase hex HMAC-SHA256 of `${timestamp}.${body}` using the
 * endpoint secret. Subscribers recompute this and compare in constant time.
 */
export async function computeWebhookSignature(
	secret: string,
	timestamp: number,
	body: string,
) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${timestamp}.${body}`),
	);
	return toHex(signature);
}

/** Header value clients verify: `t=<unix-seconds>,v1=<hex-hmac>`. */
export async function webhookSignatureHeader(
	secret: string,
	body: string,
	timestamp: number = Math.floor(Date.now() / 1000),
) {
	const signature = await computeWebhookSignature(secret, timestamp, body);
	return `t=${timestamp},v1=${signature}`;
}

/** Generates a high-entropy endpoint signing secret (shown once on creation). */
export function generateWebhookSecret() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let out = "whsec_";
	for (const byte of bytes) out += HEX[byte];
	return out;
}

const BLOCKED_HOSTNAME_PATTERNS = [
	/^localhost$/i,
	/\.localhost$/i,
	/^127\./,
	/^0\./,
	/^10\./,
	/^192\.168\./,
	/^169\.254\./, // link-local + cloud metadata (169.254.169.254)
	/^172\.(1[6-9]|2\d|3[0-1])\./, // 172.16.0.0 – 172.31.255.255
	/^\[?::1\]?$/, // IPv6 loopback
	/^\[?fd[0-9a-f]{2}:/i, // IPv6 unique-local
	/^\[?fe80:/i, // IPv6 link-local
];

/**
 * SSRF guard for subscriber URLs. Allows only absolute https URLs to public
 * hosts. Rejects http, credentials in the URL, loopback, private, and
 * link-local/metadata addresses. Returns the normalized href or null.
 */
export function safeWebhookURL(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return null;
	}
	if (url.protocol !== "https:") return null;
	if (url.username || url.password) return null;
	const hostname = url.hostname.toLowerCase();
	if (!hostname) return null;
	if (BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname))) {
		return null;
	}
	return url.href;
}

type WebhookDb = ReturnType<typeof createDb>;

/**
 * Resolves the enabled endpoints subscribed to `type`, writes one pending
 * delivery row per endpoint, and starts a delivery Workflow instance for each.
 * Safe to call from auth hooks and worker handlers: it catches its own errors so
 * a delivery problem never blocks the originating action. The `data` object must
 * be free of secrets, tokens, OTPs, or password material.
 */
export async function emitWebhookEvent(
	env: AuthEnv,
	db: WebhookDb,
	type: WebhookEventType,
	data: Record<string, unknown>,
) {
	try {
		const endpoints = await db
			.select()
			.from(schema.webhookEndpoint)
			.where(eq(schema.webhookEndpoint.disabled, false));
		const subscribed = endpoints.filter((endpoint) => endpoint.events.includes(type));
		if (subscribed.length === 0) return;

		const createdAt = new Date().toISOString();
		for (const endpoint of subscribed) {
			const deliveryId = crypto.randomUUID();
			const payload: WebhookEventPayload = {
				id: crypto.randomUUID(),
				type,
				createdAt,
				data,
			};
			await db.insert(schema.webhookDelivery).values({
				id: deliveryId,
				endpointId: endpoint.id,
				eventId: payload.id,
				eventType: type,
				payload: JSON.stringify(payload),
				status: "pending",
			});
			await env.WEBHOOK_DELIVERY_WORKFLOW.create({
				id: deliveryId,
				params: { deliveryId },
			});
		}
	} catch (error) {
		console.warn("Webhook emission failed.", error);
	}
}
