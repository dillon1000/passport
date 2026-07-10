/**
 * Classifies raw Better Auth sign-in responses before the UI navigates.
 * Inputs are client result objects; the output tells password sign-in whether
 * it should continue to the requested callback URL.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function shouldCompletePasswordSignIn(result: unknown) {
	if (!isRecord(result)) return true;

	const data = result.data;
	if (!isRecord(data)) return true;

	return data.twoFactorRedirect !== true;
}

function safeRelativeURL(value: string | null | undefined) {
	if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
		return undefined;
	}
	return value;
}

function isSignedOAuthAuthorizeQuery(searchParams: URLSearchParams) {
	return Boolean(
		searchParams.get("response_type") &&
			searchParams.get("client_id") &&
			searchParams.get("redirect_uri") &&
			searchParams.get("sig"),
	);
}

/**
 * Resolves where a completed auth step should continue. Better Auth's OAuth
 * provider sends signed authorization parameters to `/sign-in`; those params
 * must be handed back to the authorize endpoint after the user finishes login.
 * The endpoint lives under the Better Auth base path (`/api/auth`), so the
 * continuation must target `/api/auth/oauth2/authorize` — the bare
 * `/oauth2/authorize` path is not served and 404s. Explicit callback URLs are
 * limited to same-app relative paths.
 */
export function resolveAuthCallbackURL(
	searchParams: URLSearchParams,
	fallback = "/account",
) {
	const explicitCallback = safeRelativeURL(searchParams.get("callbackURL"));
	if (explicitCallback) return explicitCallback;

	if (isSignedOAuthAuthorizeQuery(searchParams)) {
		return `/api/auth/oauth2/authorize?${searchParams.toString()}`;
	}

	return fallback;
}

/**
 * Builds the absolute page URL Better Auth should include in password-reset
 * emails. The completed reset returns to `/sign-in` with the original
 * post-login destination stored as one callbackURL value, so reset-only query
 * params never get mixed into a signed OAuth authorization continuation.
 */
export function resolvePasswordResetRedirectURL(
	searchParams: URLSearchParams,
	origin: string,
) {
	const url = new URL("/sign-in", origin);
	url.searchParams.set("flow", "reset-password");
	url.searchParams.set("callbackURL", resolveAuthCallbackURL(searchParams));
	return url.toString();
}

export function resolveAddAccountURL(callbackURL = "/sessions") {
	const searchParams = new URLSearchParams({
		flow: "add-account",
		callbackURL: safeRelativeURL(callbackURL) ?? "/sessions",
	});
	return `/sign-in?${searchParams.toString()}`;
}
