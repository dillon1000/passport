/**
 * Shared HTTP contract for the delegated client API. Inputs are Passport's
 * public origin, OAuth scope requirements, and typed API failures; outputs are
 * RFC 9728 metadata, RFC 6750 bearer challenges, and the API's stable JSON
 * error envelope. Route handlers can add domain error codes without changing
 * bearer-token semantics.
 */
import { DELEGATED_CLIENT_API_SCOPES } from "./oauth-scopes";

export const CLIENT_API_PATH = "/api/v1";
export const CLIENT_API_PROTECTED_RESOURCE_METADATA_PATH =
	"/.well-known/oauth-protected-resource/api/v1";

export type ClientAPIErrorBody = {
	error: {
		code: string;
		message: string;
	};
};

export type ClientAPIErrorOptions = {
	status: number;
	code: string;
	message: string;
	headers?: HeadersInit;
};

/**
 * Carries an API-safe status, code, message, and optional protocol headers.
 * Unknown implementation errors should not be converted to this class because
 * callers rely on it to distinguish intentional public failures from faults.
 */
export class ClientAPIError extends Error {
	readonly status: number;
	readonly code: string;
	readonly headers: Headers;

	constructor({ status, code, message, headers }: ClientAPIErrorOptions) {
		super(message);
		this.name = "ClientAPIError";
		this.status = status;
		this.code = code;
		this.headers = new Headers(headers);
	}

	toJSON(): ClientAPIErrorBody {
		return {
			error: {
				code: this.code,
				message: this.message,
			},
		};
	}

	toResponse() {
		const headers = new Headers(this.headers);
		headers.set("Content-Type", "application/json; charset=UTF-8");
		return new Response(JSON.stringify(this.toJSON()), {
			status: this.status,
			headers,
		});
	}
}

function publicURL(origin: string, pathname: string) {
	const url = new URL(origin);
	url.pathname = pathname;
	url.search = "";
	url.hash = "";
	return url.toString().replace(/\/$/, "");
}

export function clientAPIResourceIdentifier(passportOrigin: string) {
	return publicURL(passportOrigin, CLIENT_API_PATH);
}

export function clientAPIAuthorizationServerIssuer(passportOrigin: string) {
	return publicURL(passportOrigin, "/api/auth");
}

export function clientAPIProtectedResourceMetadataURL(passportOrigin: string) {
	return publicURL(passportOrigin, CLIENT_API_PROTECTED_RESOURCE_METADATA_PATH);
}

export function clientAPIJWKSURL(passportOrigin: string) {
	return publicURL(passportOrigin, "/api/auth/jwks");
}

export function clientAPIProtectedResourceMetadata(passportOrigin: string) {
	return {
		resource: clientAPIResourceIdentifier(passportOrigin),
		authorization_servers: [clientAPIAuthorizationServerIssuer(passportOrigin)],
		bearer_methods_supported: ["header"],
		scopes_supported: [...DELEGATED_CLIENT_API_SCOPES],
		resource_name: "Passport Delegated Resource API",
	};
}

function bearerParameter(value: string) {
	const printable = Array.from(value, (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint < 32 || codePoint === 127 ? " " : character;
	}).join("");
	return `"${printable
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')}"`;
}

export function clientAPIBearerChallenge({
	passportOrigin,
	error,
	description,
	scopes,
}: {
	passportOrigin: string;
	error?: "invalid_token" | "insufficient_scope";
	description?: string;
	scopes?: readonly string[];
}) {
	const parameters = ["realm=\"passport\""];
	if (error) parameters.push(`error=${bearerParameter(error)}`);
	if (description) parameters.push(`error_description=${bearerParameter(description)}`);
	if (scopes?.length) parameters.push(`scope=${bearerParameter(scopes.join(" "))}`);
	parameters.push(
		`resource_metadata=${bearerParameter(
			clientAPIProtectedResourceMetadataURL(passportOrigin),
		)}`,
	);
	return `Bearer ${parameters.join(", ")}`;
}

export function invalidClientAPITokenError(passportOrigin: string) {
	const message = "The bearer access token is missing, invalid, or expired.";
	return new ClientAPIError({
		status: 401,
		code: "invalid_token",
		message,
		headers: {
			"WWW-Authenticate": clientAPIBearerChallenge({
				passportOrigin,
				error: "invalid_token",
				description: message,
			}),
		},
	});
}

export function insufficientClientAPIScopeError(
	passportOrigin: string,
	requiredScopes: readonly string[],
) {
	const message = `The access token requires scope: ${requiredScopes.join(" ")}.`;
	return new ClientAPIError({
		status: 403,
		code: "insufficient_scope",
		message,
		headers: {
			"WWW-Authenticate": clientAPIBearerChallenge({
				passportOrigin,
				error: "insufficient_scope",
				description: message,
				scopes: requiredScopes,
			}),
		},
	});
}
