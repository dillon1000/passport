# Passport

Passport is a standalone identity provider on Cloudflare Workers. It uses Hono, Better Auth, the `@better-auth/oauth-provider` OAuth 2.1/OIDC plugin, RS256 JWT/JWKS, Drizzle ORM, PostgreSQL through Hyperdrive, and a Vite React UI served as Workers static assets.

## Features

- OAuth 2.1 and OpenID Connect provider endpoints
- RS256 JWT signing with JWKS discovery
- Better Auth sessions, social login, and passkey-ready auth
- Admin-managed OAuth client registration
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
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

5. Start the auth server.

```bash
pnpm dev
```

The auth UI is served at `/sign-in`, `/account`, and `/consent`. Better Auth is mounted at `/api/auth/*`.

## Runtime Configuration

Set `ADMIN_EMAILS` to a comma-separated list of user emails that can manage OAuth clients from `/applications`. Admin users can register clients, edit redirect URIs and scopes, enable or disable clients, and rotate client secrets. Dynamic client registration is also limited to these admins.

Branding is served from `/api/brand-config` so deployments can rebrand without rebuilding the client. Optional variables include `BRAND_NAME`, `BRAND_ABBREVIATION`, `BRAND_DESCRIPTOR`, `BRAND_LOGO_SRC`, `BRAND_CAPABILITIES`, `BRAND_COLOR`, `BRAND_FOREGROUND_COLOR`, `PRIMARY_COLOR`, `PRIMARY_FOREGROUND_COLOR`, and `RING_COLOR`.

Do not commit `.dev.vars`, `.env`, production secrets, OAuth client secrets, database URLs, or private signing keys. Use `.dev.vars.example` as the shareable template for required configuration.

## Scripts

```bash
pnpm dev          # Start the local Worker and Vite app
pnpm build        # Type-check and build production assets
pnpm lint         # Run ESLint
pnpm test         # Run Vitest
pnpm db:start     # Start the local PostgreSQL helper
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

The Better Auth JWT plugin `/token` endpoint is disabled so it does not conflict with the OAuth token endpoint.

## Example Client

`example-client` is a separate Vite React + Hono Worker app that performs auth-code + PKCE login against Passport and verifies the returned ID token via JWKS.

1. Register the example client in `.dev.vars`:

```env
OAUTH_CLIENTS=[{"id":"example-client","secret":"example-client-secret","name":"Example Client","redirectUris":["http://localhost:5174/callback"],"postLogoutRedirectUris":["http://localhost:5174/"],"skipConsent":true}]
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

The example Worker fetches discovery metadata, redirects to `/api/auth/oauth2/authorize`, exchanges the authorization code at `/api/auth/oauth2/token`, loads `jwks_uri`, and verifies `id_token` with issuer and audience checks before setting its local session.

## Registering New Apps

Admins can create and manage OAuth clients from `/applications`. For a static trusted client, add an object to `OAUTH_CLIENTS`:

```json
{
	"id": "my-app",
	"secret": "replace-with-secret",
	"name": "My App",
	"redirectUris": ["https://app.example.com/callback"],
	"postLogoutRedirectUris": ["https://app.example.com/"],
	"skipConsent": false
}
```

Public clients should set `"public": true` and omit `secret`. Keep redirect URIs exact.

## Verifying Tokens

Other apps should use OIDC discovery to get `issuer`, `jwks_uri`, and supported algorithms. Verify ID tokens and JWT access tokens by checking:

- Signature against `jwks_uri`
- `iss` equals the discovery `issuer`
- `aud` equals the client ID or expected resource
- `exp`, `iat`, and any app-specific claims

The server signs JWTs with RS256 through Better Auth `jwt()`.

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
```

Create a Cloudflare Hyperdrive configuration for your PostgreSQL database, update `wrangler.jsonc` with its `id`, update `BETTER_AUTH_URL` and `TRUSTED_ORIGINS`, then deploy:

```bash
pnpm deploy
```

Deploy the example client separately if needed:

```bash
pnpm --filter passport-example-client deploy
```

## License

Passport is released under the MIT License. See [LICENSE](./LICENSE).
