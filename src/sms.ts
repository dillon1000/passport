/**
 * SMS delivery helpers for phone verification. Better Auth supplies the target
 * phone number and one-time code; this module signs and sends the matching
 * Azure Communication Services REST request. Configure delivery with
 * `AZURE_COMMUNICATION_CONNECTION_STRING` and `AZURE_COMMUNICATION_SMS_FROM`.
 */
import type { AuthEnv } from "./env";

const ACS_SMS_API_VERSION = "2026-01-23";
const ACS_SMS_PATH = `/sms?api-version=${ACS_SMS_API_VERSION}`;
const E164_PHONE_NUMBER = /^\+[1-9]\d{1,14}$/;
const textEncoder = new TextEncoder();

type AzureConnection = {
	endpoint: URL;
	accessKey: string;
};

export type AzureSMSSendResult = {
	to: string;
	successful: boolean;
	messageId?: string;
	httpStatusCode?: number;
	errorMessage?: string;
};

type SendSMSOptions = {
	fetcher?: typeof fetch;
	now?: () => Date;
};

function optionalEnv(value: string | undefined) {
	const trimmed = value?.trim();
	return trimmed || undefined;
}

export function isE164PhoneNumber(value: string) {
	return E164_PHONE_NUMBER.test(value.trim());
}

function parseAzureConnectionString(connectionString: string): AzureConnection {
	const fields = new Map<string, string>();
	for (const part of connectionString.split(";")) {
		const separatorIndex = part.indexOf("=");
		if (separatorIndex === -1) continue;
		fields.set(
			part.slice(0, separatorIndex).trim().toLowerCase(),
			part.slice(separatorIndex + 1).trim(),
		);
	}

	const endpointValue = fields.get("endpoint");
	const accessKey = fields.get("accesskey");
	if (!endpointValue || !accessKey) {
		throw new TypeError(
			"AZURE_COMMUNICATION_CONNECTION_STRING must include endpoint and accesskey fields.",
		);
	}

	const endpoint = new URL(endpointValue);
	if (endpoint.protocol !== "https:") {
		throw new TypeError("Azure Communication Services endpoint must use HTTPS.");
	}

	return { endpoint, accessKey };
}

function getAzureConnectionString(env: AuthEnv) {
	return (
		optionalEnv(env.AZURE_COMMUNICATION_CONNECTION_STRING) ??
		optionalEnv(env.COMMUNICATION_SERVICES_CONNECTION_STRING)
	);
}

function bytesToBase64(input: ArrayBuffer | Uint8Array) {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function base64ToBytes(value: string) {
	try {
		const binary = atob(value);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		return bytes;
	} catch (error) {
		throw new TypeError("Azure Communication Services access key must be base64-encoded.", {
			cause: error,
		});
	}
}

async function sha256Base64(value: string) {
	const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
	return bytesToBase64(digest);
}

async function hmacSHA256Base64(value: string, base64Key: string) {
	const key = await crypto.subtle.importKey(
		"raw",
		base64ToBytes(base64Key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
	return bytesToBase64(signature);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function stringField(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return typeof value === "number" ? value : undefined;
}

function booleanField(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return typeof value === "boolean" ? value : undefined;
}

function parseAzureSMSResult(value: unknown): AzureSMSSendResult | undefined {
	if (!isRecord(value)) return undefined;
	const to = stringField(value, "to");
	const successful = booleanField(value, "successful");
	if (!to || successful === undefined) return undefined;

	return {
		to,
		successful,
		messageId: stringField(value, "messageId"),
		httpStatusCode: numberField(value, "httpStatusCode"),
		errorMessage: stringField(value, "errorMessage"),
	};
}

function parseAzureSMSResponse(value: unknown) {
	if (!isRecord(value) || !Array.isArray(value.value)) return [];
	return value.value.flatMap((item) => {
		const result = parseAzureSMSResult(item);
		return result ? [result] : [];
	});
}

function parseJSONResponse(text: string) {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

function responseErrorMessage(responseText: string) {
	const parsed = parseJSONResponse(responseText);
	if (isRecord(parsed)) {
		const error = parsed.error;
		if (isRecord(error)) {
			return stringField(error, "message") || stringField(error, "code");
		}
		return stringField(parsed, "title");
	}
	return optionalEnv(responseText);
}

/**
 * Sends an OTP through ACS and returns the single-recipient result. The sender
 * value comes from `AZURE_COMMUNICATION_SMS_FROM`; Azure accepts an owned E.164
 * number, short code, or alphanumeric sender ID depending on the ACS resource.
 */
export async function sendPhoneVerificationSMS(
	env: AuthEnv,
	phoneNumber: string,
	code: string,
	options: SendSMSOptions = {},
) {
	const recipient = phoneNumber.trim();
	if (!isE164PhoneNumber(recipient)) {
		throw new TypeError("Phone numbers must use E.164 format.");
	}

	const connectionString = getAzureConnectionString(env);
	if (!connectionString) {
		throw new TypeError("AZURE_COMMUNICATION_CONNECTION_STRING is required to send SMS.");
	}

	const sender = optionalEnv(env.AZURE_COMMUNICATION_SMS_FROM);
	if (!sender) {
		throw new TypeError("AZURE_COMMUNICATION_SMS_FROM is required to send SMS.");
	}

	const connection = parseAzureConnectionString(connectionString);
	const url = new URL(ACS_SMS_PATH, connection.endpoint);
	const body = JSON.stringify({
		from: sender,
		message: `Your Passport verification code is ${code}.`,
		smsRecipients: [{ to: recipient }],
	});
	const timestamp = (options.now ?? (() => new Date()))().toUTCString();
	const contentHash = await sha256Base64(body);
	const stringToSign = [
		"POST",
		`${url.pathname}${url.search}`,
		`${timestamp};${url.host};${contentHash}`,
	].join("\n");
	const signature = await hmacSHA256Base64(stringToSign, connection.accessKey);
	const response = await (options.fetcher ?? fetch)(url.toString(), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-ms-date": timestamp,
			"x-ms-content-sha256": contentHash,
			Authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
		},
		body,
	});

	const responseText = await response.text();
	if (!response.ok) {
		const detail = responseErrorMessage(responseText);
		throw new Error(
			`Azure Communication Services SMS request failed with ${response.status}${
				detail ? `: ${detail}` : ""
			}.`,
		);
	}

	const [result] = responseText ? parseAzureSMSResponse(parseJSONResponse(responseText)) : [];
	if (!result) {
		return {
			to: recipient,
			httpStatusCode: response.status,
			successful: true,
		} satisfies AzureSMSSendResult;
	}

	if (!result.successful) {
		throw new Error(
			`Azure Communication Services could not send SMS to ${result.to}: ${
				result.errorMessage ?? `HTTP ${result.httpStatusCode ?? response.status}`
			}.`,
		);
	}

	return result;
}
