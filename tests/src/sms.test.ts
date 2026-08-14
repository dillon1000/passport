import { describe, expect, it, vi } from "vitest";

import type { AuthEnv } from "./env";
import { sendPhoneVerificationSMS } from "./sms";

const textEncoder = new TextEncoder();
const accessKey = btoa("test-access-key");
const testDate = new Date("2026-06-16T12:00:00.000Z");

type CapturedRequest = {
	url: string;
	init: RequestInit;
};

function createSMSEnv(overrides: Partial<AuthEnv> = {}) {
	return {
		AZURE_COMMUNICATION_CONNECTION_STRING: `endpoint=https://contoso.communication.azure.com/;accesskey=${accessKey}`,
		AZURE_COMMUNICATION_SMS_FROM: "+18001110000",
		...overrides,
	} as AuthEnv;
}

function createFetch(response: Response) {
	const requests: CapturedRequest[] = [];
	const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		requests.push({
			url: input.toString(),
			init: init ?? {},
		});
		return response;
	}) as unknown as typeof fetch;

	return { fetcher, requests };
}

function getHeader(init: RequestInit, name: string) {
	return new Headers(init.headers).get(name);
}

function bytesToBase64(input: ArrayBuffer | Uint8Array) {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

async function sha256Base64(value: string) {
	const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
	return bytesToBase64(digest);
}

async function expectedSignature({
	method,
	pathAndQuery,
	timestamp,
	host,
	contentHash,
}: {
	method: string;
	pathAndQuery: string;
	timestamp: string;
	host: string;
	contentHash: string;
}) {
	const stringToSign = `${method}\n${pathAndQuery}\n${timestamp};${host};${contentHash}`;
	const key = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode("test-access-key"),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(stringToSign));
	return bytesToBase64(signature);
}

describe("sendPhoneVerificationSMS", () => {
	it("sends a signed Azure Communication Services SMS request", async () => {
		const { fetcher, requests } = createFetch(
			Response.json({
				value: [
					{
						to: "+15555550123",
						messageId: "sms_123",
						httpStatusCode: 202,
						successful: true,
					},
				],
			}, { status: 202 }),
		);

		const result = await sendPhoneVerificationSMS(
			createSMSEnv(),
			"+15555550123",
			"123456",
			{ fetcher, now: () => testDate },
		);

		expect(result).toEqual({
			to: "+15555550123",
			messageId: "sms_123",
			httpStatusCode: 202,
			successful: true,
		});
		expect(requests).toHaveLength(1);
		expect(requests[0].url).toBe(
			"https://contoso.communication.azure.com/sms?api-version=2026-01-23",
		);
		expect(requests[0].init.method).toBe("POST");

		const body = requests[0].init.body;
		if (typeof body !== "string") {
			throw new Error("Expected ACS request body to be a string.");
		}
		expect(body).toBe(
			JSON.stringify({
				from: "+18001110000",
				message: "Your Passport verification code is 123456.",
				smsRecipients: [{ to: "+15555550123" }],
			}),
		);

		const timestamp = testDate.toUTCString();
		const contentHash = await sha256Base64(body);
		const signature = await expectedSignature({
			method: "POST",
			pathAndQuery: "/sms?api-version=2026-01-23",
			timestamp,
			host: "contoso.communication.azure.com",
			contentHash,
		});

		expect(getHeader(requests[0].init, "content-type")).toBe("application/json");
		expect(getHeader(requests[0].init, "x-ms-date")).toBe(timestamp);
		expect(getHeader(requests[0].init, "x-ms-content-sha256")).toBe(contentHash);
		expect(getHeader(requests[0].init, "authorization")).toBe(
			`HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
		);
	});

	it("rejects non-E.164 recipient phone numbers before calling Azure", async () => {
		const { fetcher } = createFetch(Response.json({ value: [] }, { status: 202 }));

		await expect(
			sendPhoneVerificationSMS(createSMSEnv(), "555-555-0123", "123456", {
				fetcher,
				now: () => testDate,
			}),
		).rejects.toThrow("Phone numbers must use E.164 format.");
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("surfaces Azure per-recipient send failures", async () => {
		const { fetcher } = createFetch(
			Response.json({
				value: [
					{
						to: "+15555550123",
						httpStatusCode: 400,
						errorMessage: "Invalid To phone number format.",
						successful: false,
					},
				],
			}, { status: 202 }),
		);

		await expect(
			sendPhoneVerificationSMS(createSMSEnv(), "+15555550123", "123456", {
				fetcher,
				now: () => testDate,
			}),
		).rejects.toThrow(
			"Azure Communication Services could not send SMS to +15555550123: Invalid To phone number format.",
		);
	});
});
