/**
 * OAuth consent helpers for the Better Auth OAuth provider UI. Inputs are the
 * raw signed consent-page query string and the provider's JSON response; output
 * is the body shape expected by `/oauth2/consent` plus the redirect URL the
 * browser should follow. Keep the raw query string intact because it is signed
 * by the provider before the user lands on `/consent`.
 */
export type OAuthConsentRequestBody = {
	accept: boolean;
	oauth_query: string;
	scope?: string;
};

export type OAuthConsentResponseBody = {
	redirect_uri?: string;
	redirectURI?: string;
	redirectTo?: string;
	url?: string;
};

export const OAUTH_CONSENT_ENDPOINT = "/api/auth/oauth2/consent";

export function oauthQueryFromLocationSearch(search: string) {
	return search.startsWith("?") ? search.slice(1) : search;
}

export function oauthConsentRequestBody(
	search: string,
	accept: boolean,
	selectedScopes?: readonly string[],
) {
	const oauthQuery = oauthQueryFromLocationSearch(search);
	if (!oauthQuery) return null;

	const body: OAuthConsentRequestBody = {
		accept,
		oauth_query: oauthQuery,
	};
	if (accept && selectedScopes) body.scope = selectedScopes.join(" ");
	return body;
}

export function oauthConsentRedirect(response: OAuthConsentResponseBody) {
	return response.redirect_uri ?? response.redirectURI ?? response.redirectTo ?? response.url;
}
