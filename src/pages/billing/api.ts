/**
 * Billing network helpers. Thin wrappers over fetch that normalize errors and
 * carry credentials. Subscription actions hit the Better Auth Stripe plugin
 * under /api/auth; catalog, one-time checkout, purchases, and the single-product
 * deeplink live under /api/billing.
 */
import type { BillingPlanCatalogEntry } from "@/lib/billing";

import type {
	BillingPlanCatalogResponse,
	BillingTarget,
	PurchaseSummary,
	SubscriptionSummary,
} from "./types";

export async function readJSON<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as
			| { error?: string; message?: string }
			| null;
		throw new Error(payload?.error ?? payload?.message ?? response.statusText);
	}
	return (await response.json()) as T;
}

export async function postSubscriptionAction<T>(path: string, body: Record<string, unknown>) {
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

export async function requestOneTimeCheckout(body: Record<string, unknown>) {
	const response = await fetch("/api/billing/checkout", {
		method: "POST",
		credentials: "same-origin",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	return readJSON<{ url?: string }>(response);
}
