# Consuming OAuth Scopes

Passport returns data according to the scopes granted to an OAuth client. Request only the scopes your app needs, then read the resulting claims from the ID token, access token, or UserInfo endpoint.

## Request Scopes

Send scopes as a space-separated value in the authorization request:

```text
GET /api/auth/oauth2/authorize
    ?response_type=code
    &client_id=your-client-id
    &redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback
    &scope=openid%20email%20organizations%3Aids%20permissions
    &state=your-random-state
```

The client must be registered for every requested scope. Users can review the requested access on the consent screen. After exchanging the authorization code, use the granted scope set returned by the OAuth flow rather than assuming every requested scope was granted.

Use `offline_access` when the app needs a refresh token. Store the newest refresh token returned by each refresh response because Passport rotates refresh tokens.

Confidential backend and BFF clients that call Passport's delegated resource API
must also send `resource={PASSPORT_ORIGIN}/api/v1` in the authorization and token
requests. The resulting JWT access token has that exact resource as its `aud`.
Keep it server-side and see [Delegated Passport Resource API](./client-write-api.md)
for endpoint, live-authorization, error, upload, and billing-handoff behavior.

## Choose Where to Read Claims

Passport exposes claims in three places:

| Source | Use it for | Scope-backed data |
| --- | --- | --- |
| ID token | Establishing the signed-in user's identity | Standard profile fields, picture, username, phone, and authentication context |
| Access token | Authorizing API requests without another network call | Compact organization/team identifiers, roles, permissions, entitlements, security state, and requested billing claims |
| UserInfo | Loading detailed user-facing account data | Full organization, team, connection, subscription, and purchase objects, plus all compact claims |

Do not use the ID token as an API authorization token. APIs should validate the access token and enforce the scopes and claims required by each operation.

## Read UserInfo

Call UserInfo with the access token:

```bash
curl \
	-H "Authorization: Bearer $ACCESS_TOKEN" \
	https://passport.example.com/api/auth/oauth2/userinfo
```

A response for `openid email organizations permissions` can look like this:

```json
{
	"sub": "user_123",
	"email": "person@example.com",
	"email_verified": true,
	"https://passport.example.com/claims/organizations": [
		{
			"id": "org_123",
			"name": "Example, Inc.",
			"slug": "example",
			"role": "owner"
		}
	],
	"https://passport.example.com/claims/organization_ids": ["org_123"],
	"https://passport.example.com/claims/organization_roles": {
		"org_123": "owner"
	},
	"https://passport.example.com/claims/roles": [
		"authenticated",
		"organization:org_123:owner"
	],
	"https://passport.example.com/claims/permissions": [
		"organization:org_123:projects:read"
	],
	"https://passport.example.com/claims/entitlements": []
}
```

Custom claim names are absolute URLs derived from the Passport issuer. Build them from the discovered issuer instead of hardcoding a deployment hostname:

```ts
function passportClaim(issuer: string, name: string) {
	return new URL(`/claims/${name}`, issuer).toString();
}

const organizations = userInfo[passportClaim(issuer, "organizations")];
const permissions = userInfo[passportClaim(issuer, "permissions")];
```

Fetch the issuer and supported scopes from `/api/auth/.well-known/openid-configuration`.

## Enforce Scopes in an API

Validate the access token signature and its `iss`, `aud`, and `exp` claims before trusting it. Then parse its space-separated `scope` claim and require the scope associated with the operation:

```ts
function grantedScopes(scope: unknown) {
	return new Set(
		typeof scope === "string" ? scope.split(" ").filter(Boolean) : [],
	);
}

function requireScope(tokenClaims: Record<string, unknown>, required: string) {
	if (!grantedScopes(tokenClaims.scope).has(required)) {
		throw new Error(`Missing required OAuth scope: ${required}`);
	}
}

requireScope(accessTokenClaims, "permissions");

const permissions = accessTokenClaims[
	passportClaim(issuer, "permissions")
];
```

A claim being absent does not necessarily mean the user has no corresponding data. It can mean the scope was not granted. Check the granted scopes before interpreting a missing claim as an empty value.

For signature verification, introspection, and revocation guidance, see [Token Validation](./token-validation.md).

## Scope Reference

| Scope | Claims and behavior |
| --- | --- |
| `openid` | Stable `sub` identifier and OIDC sign-in |
| `profile` | Standard profile claims, including `name` and `picture` |
| `email` | `email` and `email_verified` |
| `phone` | `phone_number` and `phone_number_verified` |
| `offline_access` | Refresh-token access |
| `profile:picture` | `picture` without the broader `profile` scope |
| `profile:username` | `preferred_username` |
| `organizations` | Detailed `organizations`, plus `organization_ids` and `organization_roles` |
| `organizations:ids` | `organization_ids` only |
| `organizations:roles` | `organization_roles` only |
| `teams` | Detailed `teams`, plus `team_ids` and relevant `organization_ids` |
| `teams:ids` | `team_ids` only |
| `permissions` | Tenant-scoped `roles`, `permissions`, and `entitlements` |
| `account:security` | `mfa_enabled` and `passkey_enabled` |
| `connections` | Connected-provider metadata without provider access or refresh tokens |
| `profile:write` | Update the subject's profile and manage their profile picture through `/api/v1` |
| `organizations:write` | Create, update, leave, delete, or brand organizations through `/api/v1` |
| `organization-invitations:read` | Read organization invitations through `/api/v1` |
| `organization-invitations:write` | Send, cancel, accept, or reject organization invitations through `/api/v1` |
| `organization-members:read` | Read organization membership through `/api/v1` |
| `organization-members:write` | Change roles or remove organization members through `/api/v1` |
| `teams:write` | Create, update, delete, or brand teams through `/api/v1` |
| `team-members:read` | Read team membership through `/api/v1` |
| `team-members:write` | Add or remove team members through `/api/v1` |
| `billing:checkout` | Create a hosted checkout handoff through `/api/v1` |
| `billing:manage` | Create hosted portal, cancellation, or restoration handoffs through `/api/v1` |
| `billing:status` | `billing_status` summary |
| `billing:subscriptions` | Product-level `billing_subscriptions` without raw Stripe identifiers |
| `billing:purchases` | Product-level `billing_purchases` without raw Stripe identifiers |
| `billing:entitlements` | Effective `billing_entitlements` from active plans and completed purchases |
| `billing:limits` | Effective `billing_limits` from active plans and completed purchases |

Detailed organization, team, and connection objects are UserInfo-only. Billing scopes emit their corresponding claims in both UserInfo and access tokens. Request narrow scopes such as `organizations:ids`, `teams:ids`, or `profile:picture` when detailed objects are unnecessary, and account for token size before putting detailed billing claims in an access token.

UserInfo and `/api/v1` reads return current state. Already-issued ID-token and
access-token claims remain unchanged after a delegated mutation; refresh or
reauthorize when the client needs new token claims.
