# Delegated Passport Resource API

Passport's delegated resource API lets a confidential OAuth client act for the
signed-in user without receiving a Passport browser-session cookie. It is
intended for backend and backend-for-frontend (BFF) applications. Direct browser
and mobile calls are not supported in v1, and the API does not publish CORS
headers.

The resource identifier is the Passport origin followed by `/api/v1`:

```text
https://passport.example.com/api/v1
```

Protected-resource metadata is available at:

```text
GET https://passport.example.com/.well-known/oauth-protected-resource/api/v1
```

The metadata names the authorization server, supported bearer-token method, and
available scopes. The generated API description is available from
`GET /api/v1/openapi.json`.

## Request a Resource Token

Register a confidential OAuth client with its exact redirect URI, post-logout
URI, client URI, and delegated scopes. Include the resource in both the
authorization and authorization-code token requests:

```text
GET /api/auth/oauth2/authorize
    ?response_type=code
    &client_id=acme-app
    &redirect_uri=https%3A%2F%2Facme.app%2Foauth%2Fcallback
    &scope=openid%20offline_access%20profile%3Awrite%20organizations%20organizations%3Awrite
    &resource=https%3A%2F%2Fpassport.example.com%2Fapi%2Fv1
    &state=your-random-state
```

```bash
curl https://passport.example.com/api/auth/oauth2/token \
	-u 'acme-app:replace-with-client-secret' \
	-d grant_type=authorization_code \
	-d code="$AUTHORIZATION_CODE" \
	-d redirect_uri=https://acme.app/oauth/callback \
	-d resource=https://passport.example.com/api/v1
```

Passport issues an RS256 JWT access token whose `aud` is the resource
identifier and whose `azp` is the calling client ID. Store access and refresh
tokens only in the backend or an encrypted, HTTP-only BFF session. Do not send
an ID token, opaque access token, or client-credentials token to this API.

Every call rechecks the user, OAuth client, consent, and current tenant role. A
token can stop working before `exp` when the user is disabled, the client is
disabled, consent is revoked, or current membership no longer allows the
operation.

## Scopes

Delegated write scopes do not widen any existing read scope.

| Scope | Authority |
| --- | --- |
| `profile:write` | Update the subject's name or username and manage their profile picture |
| `organizations:write` | Create, update, leave, or delete organizations and manage organization logos |
| `organization-invitations:read` | Read organization invitations |
| `organization-invitations:write` | Send, cancel, accept, or reject organization invitations |
| `organization-members:read` | Read organization members |
| `organization-members:write` | Change organization roles or remove members |
| `teams:write` | Create, update, delete, and brand teams |
| `team-members:read` | Read team membership |
| `team-members:write` | Add or remove team members |
| `billing:checkout` | Create a hosted checkout intent |
| `billing:manage` | Create hosted portal, cancellation, and restoration intents |

The existing `organizations`, `teams`, `billing:subscriptions`, and
`billing:purchases` scopes continue to authorize their corresponding read
categories. Request only the read and write categories the client needs.

## Call the API

Send the resource access token as a bearer token:

```bash
curl https://passport.example.com/api/v1/organizations \
	-H "Authorization: Bearer $PASSPORT_RESOURCE_TOKEN"
```

Successful JSON responses use a `data` envelope. Creates return `201`, updates
and reads return `200`, and successful deletes return `204` with no body.

```json
{
	"data": {
		"id": "org_123",
		"name": "ACME",
		"slug": "acme"
	}
}
```

Errors have a stable machine code and a human-readable message:

```json
{
	"error": {
		"code": "insufficient_scope",
		"message": "This operation requires organizations:write."
	}
}
```

Missing or invalid bearer tokens and insufficient scopes also return the RFC
6750 `WWW-Authenticate` header. A resource the user cannot see returns `404`; a
visible resource for which the current role lacks an action returns `403`.
Uniqueness and idempotency conflicts return `409`, oversized images return
`413`, and throttled calls return `429` with `Retry-After`.

The default limit is 120 calls per minute for each client-and-user pair. Uploads
and billing-intent creation are limited to 10 per minute. These KV-backed limits
are shared across Worker instances and should be treated as abuse protection,
not as a strict quota counter.

## Endpoint Reference

All path IDs are checked against the current actor. A client cannot select a
different user for profile or personal billing operations.

### Profile

```text
PATCH  /api/v1/me
PUT    /api/v1/me/profile-picture
DELETE /api/v1/me/profile-picture
```

`PATCH /me` accepts `name` and/or `username`. Upload a profile picture as
`multipart/form-data` with a `file` field. Passport accepts PNG, JPEG, GIF, and
WebP images up to 2 MiB.

```bash
curl -X PUT https://passport.example.com/api/v1/me/profile-picture \
	-H "Authorization: Bearer $PASSPORT_RESOURCE_TOKEN" \
	-F file=@avatar.webp
```

### Organizations

```text
GET    /api/v1/organizations
POST   /api/v1/organizations
GET    /api/v1/organizations/{organizationId}
PATCH  /api/v1/organizations/{organizationId}
DELETE /api/v1/organizations/{organizationId}
POST   /api/v1/organizations/{organizationId}/leave
PUT    /api/v1/organizations/{organizationId}/logo
DELETE /api/v1/organizations/{organizationId}/logo
```

Organization creation accepts `{ "name": "ACME", "slug": "acme" }`; `slug`
is optional. Logo uploads use the same multipart field, formats, and size limit
as profile pictures. Current organization limits, unique slugs, owner
protections, and default-team creation still apply.

### Invitations and Members

```text
GET    /api/v1/me/organization-invitations
POST   /api/v1/me/organization-invitations/{invitationId}/accept
POST   /api/v1/me/organization-invitations/{invitationId}/reject
GET    /api/v1/organizations/{organizationId}/invitations
POST   /api/v1/organizations/{organizationId}/invitations
DELETE /api/v1/organizations/{organizationId}/invitations/{invitationId}
GET    /api/v1/organizations/{organizationId}/members
PATCH  /api/v1/organizations/{organizationId}/members/{memberId}
DELETE /api/v1/organizations/{organizationId}/members/{memberId}
```

Invitation expiry and reinvite behavior match Passport's dashboard. Member
role changes and removals recheck dynamic organization roles, including the
last-owner protections.

### Teams

```text
GET    /api/v1/organizations/{organizationId}/teams
POST   /api/v1/organizations/{organizationId}/teams
GET    /api/v1/organizations/{organizationId}/teams/{teamId}
PATCH  /api/v1/organizations/{organizationId}/teams/{teamId}
DELETE /api/v1/organizations/{organizationId}/teams/{teamId}
PUT    /api/v1/organizations/{organizationId}/teams/{teamId}/logo
DELETE /api/v1/organizations/{organizationId}/teams/{teamId}/logo
GET    /api/v1/organizations/{organizationId}/teams/{teamId}/members
POST   /api/v1/organizations/{organizationId}/teams/{teamId}/members
DELETE /api/v1/organizations/{organizationId}/teams/{teamId}/members/{userId}
```

Team creation accepts `{ "name": "Engineering" }`. Passport verifies that
every nested team and member belongs to the organization in the path. Team and
membership limits, last-team rules, and organization-membership constraints are
the same as in Passport's dashboard.

### Billing

```text
GET  /api/v1/billing/products
GET  /api/v1/billing/products/{productId}
GET  /api/v1/billing/subscriptions
GET  /api/v1/billing/purchases
POST /api/v1/billing/checkout-intents
POST /api/v1/billing/portal-intents
POST /api/v1/billing/subscriptions/{subscriptionId}/cancel-intents
POST /api/v1/billing/subscriptions/{subscriptionId}/restore-intents
```

Billing mutations create a short-lived handoff rather than calling Stripe in
the client API request. This keeps payment confirmation and Stripe redirects in
Passport's signed-in UI.

Product catalog reads accept any one of `billing:checkout`,
`billing:subscriptions`, or `billing:purchases`. V1 still requires a delegated
bearer token even though the underlying catalog contains no secrets.

## Billing Handoffs and Idempotency

Every billing-intent creation request must include an `Idempotency-Key` unique
to that client operation:

```bash
curl -X POST https://passport.example.com/api/v1/billing/checkout-intents \
	-H "Authorization: Bearer $PASSPORT_RESOURCE_TOKEN" \
	-H "Content-Type: application/json" \
	-H "Idempotency-Key: 018f5ee6-0fd9-7a6b-a244-638f07ca5c17" \
	-d '{
		"productId": "prod_123",
		"annual": false,
		"seats": 1,
		"successUrl": "https://acme.app/billing/success",
		"cancelUrl": "https://acme.app/billing"
	}'
```

Include `organizationId` to select organization billing; omit it for personal
billing owned by the token subject. Portal intents accept `organizationId?` and
`returnUrl`. Cancellation and restoration intents accept `returnUrl`.

The response points at Passport rather than Stripe:

```json
{
	"data": {
		"id": "intent_123",
		"action": "checkout",
		"status": "pending",
		"expiresAt": "2026-07-10T18:15:00.000Z",
		"handoffUrl": "https://passport.example.com/billing/action/intent_123"
	}
}
```

The intent expires after 15 minutes. Passport requires the same user to sign
in, rechecks the client grant and tenant authority, displays the action for
confirmation, and executes it at most once. Refreshing a completed handoff
safely reuses the stored Stripe or portal result.

Repeating the same client, key, and request body returns the existing intent.
Reusing a key with a different body returns `409`. Retry network failures with
the original key.

Return URL origins must match one of the OAuth client's registered redirect
URIs, post-logout redirect URIs, or client URI. HTTPS is required except for an
explicitly registered loopback development origin.

## Data Freshness

API reads and UserInfo return current Passport data. ID-token and access-token
claims are immutable snapshots: updating a picture, organization, team, or
billing state does not rewrite a token already issued to the client. Refresh
the token or perform a new authorization when the client needs fresh token
claims.

Passport records each successful delegated mutation as account activity with
the calling client name and ID, action, and safe target metadata. The API does
not add client webhooks or outbound security-alert email.

## BFF Pattern

Expose only the operations your frontend needs instead of a general-purpose
proxy:

```ts
app.post("/api/teams", async (request) => {
	const session = await requireAppSession(request);
	const { organizationId, name } = await request.json();

	return fetch(
		`${passportResource}/organizations/${encodeURIComponent(organizationId)}/teams`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${session.passportAccessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name }),
		},
	);
});
```

Keep the access and refresh tokens server-side, bind the local app session to
the Passport subject, use exact upstream paths, and let Passport enforce live
authorization. The `example-client` Worker demonstrates this pattern for a
profile-picture upload, organization and team creation, and checkout handoff.
