# Token Validation

Passport exposes the standard OAuth/OIDC validation surfaces through Better Auth:

- Discovery: `/api/auth/.well-known/openid-configuration`
- JWKS: `/api/auth/jwks`
- Introspection: `/api/auth/oauth2/introspect`
- Revocation: `/api/auth/oauth2/revoke`

## Stateless Validation

Use stateless validation for normal API requests:

1. Fetch discovery and read `issuer` and `jwks_uri`.
2. Verify the JWT access token signature with JWKS.
3. Check `iss`, `aud`, `exp`, and required scopes.
4. For M2M tokens, check `azp` if the API cares which client called it.

This is fast and avoids a network call per request. The trade-off is that a revoked JWT remains valid until it expires unless the resource server also checks introspection.

## Stateful Validation

Use `/oauth2/introspect` for high-value actions, suspicious requests, or any API that needs authoritative active/revoked status:

```bash
curl -u "client_id:client_secret" \
	-d token="$ACCESS_TOKEN" \
	https://passport.example.com/api/auth/oauth2/introspect
```

Per RFC 7662, inactive, invalid, expired, or revoked tokens return a successful JSON response with `active: false`.

## Revocation

Clients revoke tokens when a user logs out, a secret is rotated after compromise, or a refresh token should no longer be usable:

```bash
curl -u "client_id:client_secret" \
	-d token="$TOKEN" \
	-d token_type_hint=refresh_token \
	https://passport.example.com/api/auth/oauth2/revoke
```

Per RFC 7009, revocation returns `200` even when the token is already invalid.

## Refresh Rotation

Clients that request `offline_access` must persist the newest refresh token returned by each refresh response. Reusing an older refresh token fails, and the installed OAuth provider invalidates the refresh-token family on detected reuse.
