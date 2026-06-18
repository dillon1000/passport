/**
 * Outbound webhook delivery Workflow. Inputs are delivery ids enqueued by
 * `emitWebhookEvent` (see src/lib/webhooks.ts); outputs are signed, retried HTTP
 * POSTs to subscriber endpoints with the result recorded in `webhook_delivery`.
 *
 * This file is Worker-only: it imports `cloudflare:workers`. The emit helper
 * lives in `src/lib/webhooks.ts` instead so the auth layer (also loaded by the
 * Better Auth CLI under Node) can raise events without importing this module.
 *
 * The Workflow signs the body with the endpoint secret (HMAC-SHA256) and POSTs
 * it, retrying with exponential backoff; the delivery row is the source of truth
 * for status/attempts.
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";

import { createDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import type { AuthEnv } from "../src/env";
import {
	webhookSignatureHeader,
	type WebhookDeliveryWorkflowPayload,
} from "../src/lib/webhooks";

const DELIVERY_TIMEOUT_MS = 10_000;

export class WebhookDeliveryWorkflow extends WorkflowEntrypoint<
	AuthEnv,
	WebhookDeliveryWorkflowPayload
> {
	async run(event: WorkflowEvent<WebhookDeliveryWorkflowPayload>, step: WorkflowStep) {
		const { deliveryId } = event.payload;
		const db = createDb(this.env);

		const target = await step.do("load webhook delivery", async () => {
			const [row] = await db
				.select({
					payload: schema.webhookDelivery.payload,
					url: schema.webhookEndpoint.url,
					secret: schema.webhookEndpoint.secret,
					disabled: schema.webhookEndpoint.disabled,
				})
				.from(schema.webhookDelivery)
				.innerJoin(
					schema.webhookEndpoint,
					eq(schema.webhookDelivery.endpointId, schema.webhookEndpoint.id),
				)
				.where(eq(schema.webhookDelivery.id, deliveryId))
				.limit(1);
			return row ?? null;
		});

		if (!target || target.disabled) return;

		try {
			const responseStatus = await step.do(
				"deliver webhook",
				{ retries: { limit: 5, delay: "10 seconds", backoff: "exponential" } },
				async () => {
					await db
						.update(schema.webhookDelivery)
						.set({ attempts: sql`${schema.webhookDelivery.attempts} + 1` })
						.where(eq(schema.webhookDelivery.id, deliveryId));
					const signature = await webhookSignatureHeader(target.secret, target.payload);
					const response = await fetch(target.url, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							"user-agent": "Passport-Webhooks/1.0",
							"x-passport-signature": signature,
							"x-passport-delivery-id": deliveryId,
						},
						body: target.payload,
						signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
					});
					if (!response.ok) {
						throw new Error(`Subscriber responded ${response.status}`);
					}
					return response.status;
				},
			);

			await step.do("mark webhook delivered", async () => {
				await db
					.update(schema.webhookDelivery)
					.set({
						status: "delivered",
						responseStatus,
						error: null,
						deliveredAt: new Date(),
					})
					.where(eq(schema.webhookDelivery.id, deliveryId));
			});
		} catch (error) {
			await step.do("mark webhook failed", async () => {
				await db
					.update(schema.webhookDelivery)
					.set({
						status: "failed",
						error: error instanceof Error ? error.message : "Delivery failed.",
					})
					.where(eq(schema.webhookDelivery.id, deliveryId));
			});
		}
	}
}
