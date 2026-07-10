/**
 * Server-side client for Passport's delegated resource API. Inputs are the
 * browser's encrypted Better Auth cookies and explicit BFF operations; outputs
 * are narrowly forwarded API responses with refreshed account cookies. The
 * OAuth access token never crosses the Worker/browser boundary. Safe
 * configuration points are `AUTH_ISSUER` and the scopes in `worker/auth.ts`.
 */
import { createExampleAuth, passportResourceURL, type ClientEnv } from "./auth";

const PASSPORT_PROVIDER_ID = "passport";

type PassportAccess = {
	accessToken: string;
	headers?: Headers;
};

type Fetcher = typeof fetch;

function appendSetCookieHeaders(target: Headers, source: Headers | undefined) {
	source?.forEach((value, key) => {
		if (key.toLowerCase() === "set-cookie") target.append(key, value);
	});
}

function delegatedError(code: string, message: string, status: number) {
	return Response.json({ error: { code, message } }, { status });
}

/**
 * Resolves a valid resource token from the encrypted account cookie. Better
 * Auth refreshes an expiring token and returns replacement cookie headers when
 * the OAuth grant includes `offline_access`.
 */
async function getPassportAccess(request: Request, env: ClientEnv): Promise<PassportAccess> {
	const result = await createExampleAuth(env).api.getAccessToken({
		body: { providerId: PASSPORT_PROVIDER_ID },
		headers: request.headers,
		returnHeaders: true,
	});

	return {
		accessToken: result.response.accessToken,
		headers: result.headers,
	};
}

/**
 * Calls a fixed Passport API path with the server-held access token. The
 * caller selects the path in code; no user-supplied upstream URL is accepted.
 */
export async function fetchPassportResource(
	env: Pick<ClientEnv, "AUTH_ISSUER">,
	accessToken: string,
	path: string,
	init: RequestInit = {},
	fetcher: Fetcher = fetch,
) {
	const headers = new Headers(init.headers);
	headers.set("authorization", `Bearer ${accessToken}`);
	headers.set("accept", "application/json");

	return fetcher(new URL(path.replace(/^\/+/, ""), `${passportResourceURL(env)}/`), {
		...init,
		headers,
	});
}

/**
 * Authenticates one browser BFF request, calls Passport, and streams the
 * response back while retaining only response headers that matter to API
 * clients. Authentication failures never reveal token or cookie material.
 */
export async function handlePassportResourceRequest(
	request: Request,
	env: ClientEnv,
	path: string,
	init: RequestInit = {},
) {
	let access: PassportAccess;
	try {
		access = await getPassportAccess(request, env);
	} catch {
		return delegatedError(
			"not_authenticated",
			"Sign in with Passport before using delegated actions.",
			401,
		);
	}

	let upstream: Response;
	try {
		upstream = await fetchPassportResource(env, access.accessToken, path, init);
	} catch {
		const response = delegatedError(
			"passport_unavailable",
			"Passport could not be reached. Try again shortly.",
			502,
		);
		appendSetCookieHeaders(response.headers, access.headers);
		return response;
	}

	const headers = new Headers();
	for (const name of [
		"cache-control",
		"content-type",
		"location",
		"retry-after",
		"www-authenticate",
	]) {
		const value = upstream.headers.get(name);
		if (value) headers.set(name, value);
	}
	appendSetCookieHeaders(headers, access.headers);

	return new Response(upstream.body, {
		headers,
		status: upstream.status,
		statusText: upstream.statusText,
	});
}
