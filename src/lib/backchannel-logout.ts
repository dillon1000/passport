/**
 * OIDC Back-Channel Logout token construction (pure; no DB or Node imports, safe
 * for client and server). Inputs are the issuer, the audience client id, and the
 * subject user id; output is the `logout_token` claim set defined by the OpenID
 * Connect Back-Channel Logout 1.0 spec.
 *
 * The minting (signing with the JWKS key via `auth.api.signJWT`) and delivery
 * live in the worker; this module only shapes spec-correct claims so they can be
 * unit-tested without a signer.
 *
 * Correctness notes:
 * - `iss` MUST equal the issuer used for this provider's id_tokens, which is
 *   `${BETTER_AUTH_URL}/api/auth` (Better Auth's context.baseURL includes the
 *   basePath). `backchannelLogoutIssuer` derives exactly that.
 * - A logout token MUST contain a `sub` and/or `sid` and the `events` claim, and
 *   MUST NOT contain a `nonce` (per spec, to distinguish it from an id_token).
 */
export const BACKCHANNEL_LOGOUT_EVENT =
	"http://schemas.openid.net/event/backchannel-logout";

/** Logout tokens are single-use and short-lived. */
export const LOGOUT_TOKEN_TTL_SECONDS = 120;

export function backchannelLogoutIssuer(betterAuthURL: string) {
	return new URL("/api/auth", betterAuthURL).toString();
}

export function buildLogoutTokenClaims(input: {
	issuer: string;
	audience: string;
	subject: string;
	sessionId?: string;
}): Record<string, unknown> {
	const iat = Math.floor(Date.now() / 1000);
	const claims: Record<string, unknown> = {
		iss: input.issuer,
		aud: input.audience,
		sub: input.subject,
		iat,
		exp: iat + LOGOUT_TOKEN_TTL_SECONDS,
		jti: crypto.randomUUID(),
		events: { [BACKCHANNEL_LOGOUT_EVENT]: {} },
	};
	if (input.sessionId) claims.sid = input.sessionId;
	return claims;
}
