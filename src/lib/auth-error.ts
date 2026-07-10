/**
 * Custom auth error-page helpers. Better Auth redirects API failures to the
 * app-owned error route with `error` and optional `error_description` query
 * params; this module normalizes those inputs into safe display strings for
 * the React page while keeping the route path shared with the server config.
 */
export const AUTH_ERROR_PATH = "/auth/error";

const DEFAULT_AUTH_ERROR_CODE = "UNKNOWN";
const DEFAULT_AUTH_ERROR_DESCRIPTION = "The authentication request could not be completed.";
const MAX_AUTH_ERROR_DESCRIPTION_LENGTH = 240;

function normalizedErrorCode(value: string | null) {
	const trimmed = value?.trim();
	if (!trimmed) return DEFAULT_AUTH_ERROR_CODE;
	return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : DEFAULT_AUTH_ERROR_CODE;
}

function normalizedErrorDescription(value: string | null) {
	const normalized = value?.replace(/\s+/g, " ").trim();
	if (!normalized) return DEFAULT_AUTH_ERROR_DESCRIPTION;
	if (normalized.length <= MAX_AUTH_ERROR_DESCRIPTION_LENGTH) return normalized;
	return `${normalized.slice(0, MAX_AUTH_ERROR_DESCRIPTION_LENGTH).trimEnd()}...`;
}

export function authErrorDetails(searchParams: URLSearchParams) {
	return {
		code: normalizedErrorCode(searchParams.get("error")),
		description: normalizedErrorDescription(searchParams.get("error_description")),
	};
}
