import { describe, expect, it } from "vitest";

import {
	computeWebhookSignature,
	generateWebhookSecret,
	safeWebhookURL,
	webhookSignatureHeader,
} from "./webhooks";

describe("webhook signing", () => {
	it("computes a stable hex HMAC-SHA256 over `${timestamp}.${body}`", async () => {
		const signature = await computeWebhookSignature("whsec_test", 1_700_000_000, "{}");
		expect(signature).toMatch(/^[0-9a-f]{64}$/);
		// Deterministic for the same inputs.
		expect(await computeWebhookSignature("whsec_test", 1_700_000_000, "{}")).toBe(signature);
		// Sensitive to the body.
		expect(await computeWebhookSignature("whsec_test", 1_700_000_000, "{ }")).not.toBe(signature);
	});

	it("formats the signature header as t=<ts>,v1=<hmac>", async () => {
		const header = await webhookSignatureHeader("whsec_test", "{}", 1_700_000_000);
		expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
	});

	it("generates prefixed high-entropy secrets", () => {
		const secret = generateWebhookSecret();
		expect(secret).toMatch(/^whsec_[0-9a-f]{64}$/);
		expect(generateWebhookSecret()).not.toBe(secret);
	});
});

describe("safeWebhookURL (SSRF guard)", () => {
	it("accepts absolute https URLs to public hosts", () => {
		expect(safeWebhookURL("https://app.example.com/hooks")).toBe(
			"https://app.example.com/hooks",
		);
	});

	it("rejects non-https, credentialed, loopback, private, and metadata targets", () => {
		expect(safeWebhookURL("http://app.example.com/hooks")).toBeNull();
		expect(safeWebhookURL("https://user:pass@app.example.com")).toBeNull();
		expect(safeWebhookURL("https://localhost/hooks")).toBeNull();
		expect(safeWebhookURL("https://127.0.0.1/hooks")).toBeNull();
		expect(safeWebhookURL("https://10.0.0.5/hooks")).toBeNull();
		expect(safeWebhookURL("https://192.168.1.10/hooks")).toBeNull();
		expect(safeWebhookURL("https://172.16.0.1/hooks")).toBeNull();
		expect(safeWebhookURL("https://169.254.169.254/latest/meta-data")).toBeNull();
		expect(safeWebhookURL("not a url")).toBeNull();
		expect(safeWebhookURL("")).toBeNull();
		expect(safeWebhookURL(undefined)).toBeNull();
	});
});
