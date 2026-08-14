# Passport

Passport is a standalone identity provider on Cloudflare Workers. It uses Hono, Better Auth, the `@better-auth/oauth-provider` OAuth 2.1/OIDC plugin, RS256 JWT/JWKS, Drizzle ORM, PostgreSQL through Hyperdrive, and a Vite React UI served as Workers static assets.

## Features

- OAuth 2.1 and OpenID Connect provider endpoints
- RS256 JWT signing with JWKS discovery
- Delegated `/api/v1` profile, organization, team, membership, and billing operations for confidential OAuth clients
- Machine-to-machine `client_credentials` clients with protected API audiences
- Token introspection, revocation, and refresh-token rotation
- KV-backed auth rate limiting and identity-keyed account lockout
- Stripe customer, subscription, checkout, billing portal, trial, tax, seat, and organization billing support
- Better Auth sessions, social login, and passkey-ready auth
- Admin-managed OAuth client registration
- Admin audit timeline for user and OAuth client mutations
- Organization, member, invitation, and team management
- Brand configuration from runtime environment variables
- Vite React UI served from the same Cloudflare Worker
- Example OAuth client with auth-code + PKCE login

## Requirements

- Node.js 22 or newer
- pnpm
- PostgreSQL for local development and production
- Cloudflare Wrangler for local Worker development and deploys

## Local Setup

1. Install dependencies.

```bash
pnpm install
```

2. Copy `.dev.vars.example` to `.dev.vars` and fill every secret.

```bash
cp .dev.vars.example .dev.vars
```

3. Create a local PostgreSQL database and export `DATABASE_URL`.

```bash
pnpm db:start
export DATABASE_URL=postgresql://postgres:postgres@localhost:55432/passport
```

4. Generate and apply database migrations.

```bash
pnpm dlx @better-auth/cli@latest generate --output ./src/db/schema.ts
pnpm db:generate
pnpm db:migrate
```

5. Start the auth server.

```bash
pnpm dev
```

The auth UI is served at `/sign-in`, `/account`, `/billing`, and `/consent`. Better Auth is mounted at `/api/auth/*`.

## Runtime Configuration

Set `ADMIN_EMAILS` to a comma-separated list of user emails that can manage OAuth clients from `/applications` and review privileged mutations from `/admin/audit`. Admin users can register clients, edit redirect URIs and scopes, enable or disable clients, rotate client secrets, change user roles, and ban or unban users. Dynamic client registration is also limited to these admins.

Branding is served from `/api/brand-config` so deployments can rebrand without rebuilding the client. Optional variables include `BRAND_NAME`, `BRAND_DESCRIPTOR`, `BRAND_LOGO_SRC`, `BRAND_CAPABILITIES`, `BRAND_COLOR`, `BRAND_FOREGROUND_COLOR`, `PRIMARY_COLOR`, `PRIMARY_FOREGROUND_COLOR`, and `RING_COLOR`.

Phone verification SMS uses Azure Communication Services. Set `AZURE_COMMUNICATION_CONNECTION_STRING` from the ACS resource keys and `AZURE_COMMUNICATION_SMS_FROM` to an SMS-enabled ACS sender. Recipient phone numbers must use E.164 format, such as `+14255550123`.

Machine-to-machine API authorization uses `OAUTH_RESOURCES`, a JSON array of protected API audiences and allowed scopes. See [machine-to-machine tokens](./docs/machine-to-machine.md).

Confidential client apps can request `{PASSPORT_ORIGIN}/api/v1` as an OAuth resource and use the resulting delegated access token from a backend or BFF. See the [delegated Passport resource API](./docs/client-write-api.md).

Stripe billing is optional and enabled when `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are both configured. Define products with `STRIPE_BILLING_PLANS`, a JSON array of plans using Stripe Prices or lookup keys. Plan metadata can include `limits`, `entitlements`, `freeTrialDays`, `annualDiscountPriceId` / `annualDiscountLookupKey`, `seatPriceId`, `lineItems`, and `prorationBehavior`. Checkout customization is controlled by `STRIPE_CHECKOUT_*` variables for promotion codes, automatic tax, tax ID collection, billing address collection, and submit text. Configure a Stripe webhook at `/api/auth/stripe/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.

Attack protection is enabled by default. Better Auth rate limits use `AUTH_SECONDARY_STORAGE` through `AUTH_RATE_LIMIT_*` and `AUTH_SENSITIVE_RATE_LIMIT_*`; repeated failed credential sign-ins are locked by identifier with `ACCOUNT_LOCKOUT_*`. KV is the shared throttling store, not a strict atomic counter. CAPTCHA remains optional and complementary. Breached-password checks are not wired because they require an external service. Risk-based step-up is deferred to a separate sign-in-flow plan; caller-requested re-auth still uses the existing OIDC `prompt` / `max_age` support.

Do not commit `.dev.vars`, `.env`, production secrets, OAuth client secrets, database URLs, or private signing keys. Use `.dev.vars.example` as the shareable template for required configuration.

## Scripts

```bash
pnpm dev          # Start the local Worker and Vite app
pnpm build        # Type-check and build production assets
pnpm lint         # Run ESLint
pnpm test         # Run Vitest
pnpm db:start     # Start the local PostgreSQL helper
pnpm db:generate  # Generate Drizzle migrations
pnpm db:migrate   # Apply Drizzle migrations using DATABASE_URL or .dev.vars
pnpm db:migrate prod # Apply Drizzle migrations using PROD_DATABASE_URL or .dev.vars
pnpm admin:promote <email> # Promote an existing user to admin
pnpm deploy       # Build and deploy with Wrangler
```

## Required Endpoints

OIDC discovery:

```bash
curl http://localhost:5173/api/auth/.well-known/openid-configuration
```

OAuth authorization-server metadata:

```bash
curl http://localhost:5173/api/auth/.well-known/oauth-authorization-server
curl http://localhost:5173/.well-known/oauth-authorization-server/api/auth
```

JWKS:

```bash
curl http://localhost:5173/api/auth/jwks
```

OAuth token endpoint:

```text
POST /api/auth/oauth2/token
```

OAuth introspection and revocation endpoints:

```text
POST /api/auth/oauth2/introspect
POST /api/auth/oauth2/revoke
```

The Better Auth JWT plugin `/token` endpoint is disabled so it does not conflict with the OAuth token endpoint.

Stripe billing endpoints are mounted under Better Auth:

```text
GET  /api/billing/plans
POST /api/auth/subscription/upgrade
GET  /api/auth/subscription/list
POST /api/auth/subscription/cancel
POST /api/auth/subscription/restore
POST /api/auth/subscription/billing-portal
GET  /api/auth/subscription/success
POST /api/auth/stripe/webhook
```

## Example Client

`example-client` is a separate Vite React + Hono Worker app that uses Better Auth as a stateless OAuth client for Passport.

1. Register the example client in `.dev.vars`:

```env
OAUTH_CLIENTS=[{"id":"example-client","secret":"example-client-secret","name":"Example Client","redirectUris":["http://localhost:5174/callback"],"postLogoutRedirectUris":["http://localhost:5174/"],"scopes":["openid","offline_access","profile","email","phone","profile:picture","profile:username","organizations","organizations:ids","organizations:roles","teams","teams:ids","permissions","account:security","connections","profile:write","organizations:write","teams:write","billing:subscriptions","billing:purchases","billing:checkout"],"skipConsent":true}]
```

2. Copy its env example.

```bash
cp example-client/.dev.vars.example example-client/.dev.vars
```

3. Run both apps in separate terminals.

```bash
pnpm dev
pnpm --filter passport-example-client dev
```

4. Open `http://localhost:5174` and start OIDC login.

The example Worker mounts Better Auth at `/api/auth/*`, requests the `/api/v1` resource, accepts the registered `/callback` redirect, and exposes `/api/session` so the UI can inspect the ID token, UserInfo, and access-token claim groups Better Auth stores for the local session. Its explicit `/api/delegated/*` BFF routes keep OAuth tokens server-side while demonstrating profile-picture upload, organization and team creation, and checkout-intent creation. Static asset config runs the Worker first for `/api/*` and `/callback`, so browser navigations do not get swallowed by the SPA fallback.

## Registering New Apps

Admins can create and manage OAuth clients from `/applications`. For a static trusted client, add an object to `OAUTH_CLIENTS`:

```json
{
	"id": "my-app",
	"secret": "replace-with-secret",
	"name": "My App",
	"redirectUris": ["https://app.example.com/callback"],
	"postLogoutRedirectUris": ["https://app.example.com/"],
	"scopes": ["openid", "profile", "email"],
	"skipConsent": false
}
```

Public clients should set `"public": true` and omit `secret`. Keep redirect URIs exact.

Machine-to-machine clients use `grantTypes: ["client_credentials"]`, no redirect URIs, and `allowedAudiences` that match `OAUTH_RESOURCES`. Register them from `/applications` or follow [the M2M guide](./docs/machine-to-machine.md).

Organization-owned OAuth clients are planned but not shipped. See [the tenant ownership design](./docs/organization-owned-oauth-clients.md) for the proposed ownership, route, policy, and migration model.

## Custom OAuth Scopes

Passport advertises standard OIDC scopes plus Passport-specific scopes through discovery. Apps can request:

- `openid` - verify the stable subject identifier.
- `profile` - read standard profile claims such as name and picture.
- `email` - read email address and verification state.
- `phone` - read phone number and verification state.
- `offline_access` - request refresh-token access.
- `profile:picture` - read only the profile picture URL without the broader `profile` scope.
- `profile:username` - read only `preferred_username`.
- `organizations` - read organization memberships and roles.
- `organizations:ids` - read only organization IDs.
- `organizations:roles` - read organization IDs plus the user's role in each organization.
- `teams` - read team memberships inside organizations.
- `teams:ids` - read only team IDs.
- `permissions` - read tenant-scoped policy outputs for roles, permissions, and reserved entitlements.
- `platform:admin` - read whether the signed-in user is a Passport platform administrator. This scope is excluded from dynamic client registration; an administrator must explicitly assign it to an approved client.
- `account:security` - read minimal MFA/passkey enrollment state.
- `connections` - read connected social provider account metadata without provider tokens.
- `profile:write` - update the current user's name or username and manage their profile picture.
- `organizations:write` - create, update, leave, or delete organizations and manage organization logos.
- `organization-invitations:read` / `organization-invitations:write` - read or manage invitations.
- `organization-members:read` / `organization-members:write` - read or manage organization membership.
- `teams:write` - create, update, delete, and brand teams.
- `team-members:read` / `team-members:write` - read or manage team membership.
- `billing:checkout` - create a hosted checkout handoff.
- `billing:manage` - create hosted billing portal, cancellation, and restoration handoffs.
- `billing:status` - read active/trial/past-due/canceled billing status.
- `billing:subscriptions` - read product-level subscription rows without raw Stripe identifiers.
- `billing:purchases` - read product-level one-time purchase rows without raw Stripe identifiers.
- `billing:entitlements` - read feature entitlements derived from active billing plans and completed one-time purchases.
- `billing:limits` - read product limits derived from active billing plans and completed one-time purchases.

Standard profile data and Passport custom data are emitted as standard OIDC claims or namespaced claims based on the issuer URL:

- `picture`
- `phone_number`
- `phone_number_verified`
- `preferred_username`
- `{issuer}/claims/organizations`
- `{issuer}/claims/teams`
- `{issuer}/claims/organization_ids`
- `{issuer}/claims/organization_roles`
- `{issuer}/claims/team_ids`
- `{issuer}/claims/roles`
- `{issuer}/claims/permissions`
- `{issuer}/claims/entitlements`
- `{issuer}/claims/platform_admin`
- `{issuer}/claims/mfa_enabled`
- `{issuer}/claims/passkey_enabled`
- `{issuer}/claims/connections`
- `{issuer}/claims/billing_status`
- `{issuer}/claims/billing_subscriptions`
- `{issuer}/claims/billing_purchases`
- `{issuer}/claims/billing_entitlements`
- `{issuer}/claims/billing_limits`

Detailed organization, team, connection, and subscription objects are returned from `/oauth2/userinfo`. Access tokens keep compact identifiers, tenant-scoped roles, tenant-scoped permissions, billing status, billing entitlements, billing limits, reserved entitlement output, and minimal security posture so downstream services can authorize requests without carrying large membership payloads. Raw Stripe customer, subscription, and schedule identifiers are not emitted in OAuth claims. `relationships` is intentionally not supported until Passport has a relationship data model.

## Verifying Tokens

Other apps should use OIDC discovery to get `issuer`, `jwks_uri`, and supported algorithms. Verify ID tokens and JWT access tokens by checking:

- Signature against `jwks_uri`
- `iss` equals the discovery `issuer`
- `aud` equals the client ID or expected resource
- `exp`, `iat`, and any app-specific claims

The server signs JWTs with RS256 through Better Auth `jwt()`.

For resource-server validation, introspection, revocation, and refresh-rotation behavior, see [token validation](./docs/token-validation.md).

## Deploy

Create production secrets:

```bash
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put DISCORD_CLIENT_ID
wrangler secret put DISCORD_CLIENT_SECRET
wrangler secret put X_CLIENT_ID
wrangler secret put X_CLIENT_SECRET
wrangler secret put OAUTH_CLIENTS
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put STRIPE_BILLING_PLANS
wrangler secret put AZURE_COMMUNICATION_CONNECTION_STRING
wrangler secret put AZURE_COMMUNICATION_SMS_FROM
```

Create a Cloudflare Hyperdrive configuration for your PostgreSQL database, update `wrangler.jsonc` with its `id`, update `BETTER_AUTH_URL` and `TRUSTED_ORIGINS`, set `PROD_DATABASE_URL` in `.dev.vars`, run production migrations, then deploy:

```bash
pnpm db:migrate prod
pnpm run deploy
```

Deploy the example client separately if needed:

```bash
pnpm --filter passport-example-client deploy
```

## License

Passport is released under the MIT License. See [LICENSE](./LICENSE).
