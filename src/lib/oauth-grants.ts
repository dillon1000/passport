/**
 * OAuth grant constants shared by the server, Worker DTO validation, and UI.
 * Inputs are grant-type strings from OAuth client metadata; outputs are narrow
 * TypeScript unions and small predicates so every layer agrees on which clients
 * are browser/user clients versus machine-to-machine clients.
 */
export const OAUTH_GRANT_TYPES = [
	"authorization_code",
	"client_credentials",
	"refresh_token",
] as const;

export type OAuthGrantType = (typeof OAUTH_GRANT_TYPES)[number];

export const BROWSER_OAUTH_GRANT_TYPES = [
	"authorization_code",
	"refresh_token",
] as const satisfies readonly OAuthGrantType[];

export const MACHINE_OAUTH_GRANT_TYPES = [
	"client_credentials",
] as const satisfies readonly OAuthGrantType[];

export function hasClientCredentialsGrant(
	grantTypes: readonly string[] | null | undefined,
) {
	return grantTypes?.includes("client_credentials") ?? false;
}
