/**
 * Billing network helpers. Thin wrappers over fetch that normalize errors and
 * carry credentials. Subscription actions hit the Better Auth Stripe plugin
 * under /api/auth; catalog, one-time checkout, purchases, and the single-product
 * deeplink live under /api/billing.
 */
import type { BillingPlanCatalogEntry } from "@/lib/billing";
import { z } from "zod";

import type {
	BillingPlanCatalogResponse,
	BillingTarget,
	PurchaseSummary,
	SubscriptionSummary,
} from "./types";

type BillingActionBody = {
	plan?: string;
	annual?: boolean;
	referenceId?: string;
	customerType: BillingTarget["customerType"];
	subscriptionId?: string;
	successUrl?: string;
	cancelUrl?: string;
	returnUrl?: string;
	disableRedirect?: boolean;
};
type OneTimeCheckoutBody = {
	plan: string;
	customerType: BillingTarget["customerType"];
	referenceId?: string;
	successUrl: string;
	cancelUrl: string;
};
const apiErrorSchema = z.object({ error: z.string().optional(), message: z.string().optional() });

export async function readJSON<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const payload = apiErrorSchema.safeParse(await response.json().catch(() => null));
		throw new Error(payload.success ? payload.data.error ?? payload.data.message ?? response.statusText : response.statusText);
	}
	return response.json();
}

export async function postSubscriptionAction<T>(path: string, body: BillingActionBody) {
	const response = await fetch(`/api/auth${path}`, {
		method: "POST",
		credentials: "same-origin",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	return readJSON<T>(response);
}

export async function fetchCatalog() {
	return fetch("/api/billing/plans").then(readJSON<BillingPlanCatalogResponse>);
}

export async function listSubscriptions(target: BillingTarget) {
	const params = new URLSearchParams({ customerType: target.customerType });
	if (target.referenceId) params.set("referenceId", target.referenceId);
	const response = await fetch(`/api/auth/subscription/list?${params.toString()}`, {
		credentials: "same-origin",
	});
	return readJSON<SubscriptionSummary[]>(response);
}

export async function listPurchases(target: BillingTarget) {
	const params = new URLSearchParams({ customerType: target.customerType });
	if (target.referenceId) params.set("referenceId", target.referenceId);
	const response = await fetch(`/api/billing/purchases?${params.toString()}`, {
		credentials: "same-origin",
	});
	return readJSON<PurchaseSummary[]>(response);
}

/** Resolve a single plan by its `prod_…` id, including hidden deeplink products. */
export async function fetchProduct(id: string) {
	const response = await fetch(`/api/billing/products/${encodeURIComponent(id)}`, {
		credentials: "same-origin",
	});
	const payload = await readJSON<{ product: BillingPlanCatalogEntry }>(response);
	return payload.product;
}

export async function requestOneTimeCheckout(body: OneTimeCheckoutBody) {
	const response = await fetch("/api/billing/checkout", {
		method: "POST",
		credentials: "same-origin",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	return readJSON<{ url?: string }>(response);
}
