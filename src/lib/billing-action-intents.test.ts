/** Callback-origin policy tests for delegated hosted billing handoffs. */
import { describe, expect, it } from "vitest";

import {
	BillingActionIntentError,
	billingIntentRequestHash,
	validateBillingReturnURLs,
} from "./billing-action-intents";

const client = {
	clientId: "client_acme",
	redirectUris: ["https://acme.app/oauth/callback", "http://127.0.0.1:8788/callback"],
	postLogoutRedirectUris: ["https://admin.acme.app/logout"],
	uri: "https://acme.app",
};

describe("billing action return URLs", () => {
	it("hashes equivalent payloads identically and detects changed input", async () => {
		const first = await billingIntentRequestHash({ productId: "prod_1", annual: false });
		const reordered = await billingIntentRequestHash({ annual: false, productId: "prod_1" });
		const changed = await billingIntentRequestHash({ productId: "prod_1", annual: true });
		expect(reordered).toBe(first);
		expect(changed).not.toBe(first);
	});

	it("allows paths on registered HTTPS and loopback origins", () => {
		expect(
			validateBillingReturnURLs(client, [
				{ label: "successUrl", value: "https://acme.app/billing/success?from=passport" },
				{ label: "cancelUrl", value: "http://127.0.0.1:8788/billing/cancel" },
			]),
		).toEqual([
			"https://acme.app/billing/success?from=passport",
			"http://127.0.0.1:8788/billing/cancel",
		]);
	});

	it.each([
		"https://evil.example/steal",
		"http://acme.app/insecure",
		"not-a-url",
	])("rejects an unsafe callback: %s", (value) => {
		expect(() =>
			validateBillingReturnURLs(client, [{ label: "returnUrl", value }]),
		).toThrow(BillingActionIntentError);
	});
});
