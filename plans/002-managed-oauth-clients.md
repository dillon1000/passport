# Plan 002: Add managed OAuth client registration

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f7dcb84..HEAD -- src/auth.ts src/env.ts .dev.vars.example README.md worker/app.ts worker/index.ts worker/app.test.ts src/db/schema.ts src/pages/Applications.tsx src/lib/nav.ts src/App.tsx`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/001-authorized-applications.md`
- **Category**: direction
- **Planned at**: commit `f7dcb84`, 2026-06-14

## Why this matters

Passport currently registers OAuth clients through a JSON secret in `OAUTH_CLIENTS`. That works for bootstrapping but makes routine app registration an operator/deploy task and keeps the Applications page user-focused only. The schema already has an `oauth_client` table with redirect URIs, metadata, public-client flags, and ownership fields, so Passport can grow into a real identity-provider control plane.

## Current state

- `src/auth.ts` seeds trusted clients from `OAUTH_CLIENTS`.
- `.dev.vars.example` shows a JSON array for the example client.
- `README.md` tells operators to edit `OAUTH_CLIENTS` to register apps.
- `src/db/schema.ts` has a full `oauth_client` table.
- The UI has a dashboard nav with Account/Security/Sessions/Applications only.

Current env parsing:

```ts
// src/env.ts:1-9
export type OAuthClientSeed = {
	id: string;
	secret?: string;
	name: string;
	redirectUris: string[];
	postLogoutRedirectUris?: string[];
	public?: boolean;
	skipConsent?: boolean;
};
```

```ts
// src/env.ts:35-45
export function parseOAuthClientSeeds(value: string | undefined): OAuthClientSeed[] {
	if (!value) {
		return [];
	}

	const parsed = JSON.parse(value) as OAuthClientSeed[];
	if (!Array.isArray(parsed)) {
		throw new TypeError("OAUTH_CLIENTS must be a JSON array.");
	}

	return parsed;
}
```

Current Better Auth config:

```ts
// src/auth.ts:110-127
oauthProvider({
	loginPage: "/sign-in",
	consentPage: "/consent",
	disabledPaths: ["/token"],
	...
	trustedClients: parseOAuthClientSeeds(env.OAUTH_CLIENTS).map((client) => ({
		clientId: client.id,
		clientSecret: client.secret,
		name: client.name,
		redirectURLs: client.redirectUris,
		postLogoutRedirectURLs: client.postLogoutRedirectUris,
		public: client.public,
		skipConsent: client.skipConsent,
	})),
}),
```

Schema excerpt:

```ts
// src/db/schema.ts:119-153
export const oauthClient = pgTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    scopes: text("scopes").array(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    public: boolean("public"),
    requirePKCE: boolean("require_pkce"),
```

Dashboard route convention:

```ts
// src/lib/nav.ts:7-12
export const dashboardNav: NavItem[] = [
	{ href: "/account", label: "Account" },
	{ href: "/security", label: "Security" },
	{ href: "/sessions", label: "Sessions" },
	{ href: "/applications", label: "Applications" },
];
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Focused tests | `pnpm test -- worker/app.test.ts` | exit 0 |
| Full tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build/typecheck | `pnpm run build` | exit 0 |

## Scope

**In scope**:
- `src/auth.ts`
- `src/env.ts`
- `.dev.vars.example`
- `README.md`
- `worker/app.ts`
- `worker/index.ts`
- `worker/app.test.ts`
- `src/pages/Applications.tsx` or a new `src/pages/DeveloperApps.tsx`
- `src/lib/nav.ts`
- `src/App.tsx`
- New helper files under `src/lib/` or `worker/`

**Out of scope**:
- Do not edit generated `src/db/schema.ts`.
- Do not implement dynamic client registration protocol unless Better Auth already supports it directly and safely.
- Do not store plaintext generated client secrets in browser-visible state.
- Do not add billing, organizations, or multi-tenant roles here.

## Git workflow

- Branch: `branch/002-managed-oauth-clients`
- Commit message style: simple imperative, matching the existing commit.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Verify Better Auth's supported client source

Before coding, inspect the installed package docs/types for `@better-auth/oauth-provider` in `node_modules` and determine how the provider discovers clients:

- Does it read `oauth_client` rows from the adapter automatically?
- Does `trustedClients` only seed static clients?
- Is there an official server API for creating clients?

Record the finding in a short code comment only if it explains a non-obvious implementation choice. Prefer official APIs. If the provider cannot use DB-backed clients at runtime, stop; do not build a UI that writes rows the OAuth provider ignores.

**Verify**: Write down the exact package file or docs path used in your implementation notes, then continue only if DB-backed or official client creation is supported.

### Step 2: Add admin authorization configuration

Add an `ADMIN_EMAILS` env var to `src/env.ts` and `.dev.vars.example`. It should be a comma-separated allowlist using the existing `splitCsv` helper. In `worker/app.ts`, create a helper that:

- requires a session
- checks `session.user.email` against `ADMIN_EMAILS`
- returns `401` for no session and `403` for non-admin users

If the current `SessionResolver` type only exposes `user.id`, extend it to include `email?: string | null` without breaking existing tests.

**Verify**: Add Worker tests for unauthenticated and non-admin access to the new admin API; `pnpm test -- worker/app.test.ts` exits 0.

### Step 3: Add managed-client API endpoints

Add admin-only endpoints under `/api/admin/oauth-clients`:

- `GET /api/admin/oauth-clients`
- `POST /api/admin/oauth-clients`
- `PATCH /api/admin/oauth-clients/:clientId`
- `POST /api/admin/oauth-clients/:clientId/rotate-secret`
- `POST /api/admin/oauth-clients/:clientId/disable`
- `POST /api/admin/oauth-clients/:clientId/enable`

Validate request bodies with `zod` because `zod` is already a dependency. Validate:

- `clientId`: non-empty, URL-safe-ish string
- `name`: non-empty string
- `redirectUris`: non-empty array of absolute `http://` or `https://` URLs
- `postLogoutRedirectUris`: optional array of absolute URLs
- `public`: boolean
- `skipConsent`: boolean
- `scopes`: optional array, defaulting to `["openid", "profile", "email"]`

For confidential clients, generate a secret using Web Crypto. Return the secret only once on create/rotate. Store it in the format Better Auth expects; if Better Auth expects hashing or a helper API, use that. Never log it.

**Verify**: `pnpm test -- worker/app.test.ts` exits 0 with tests for create, validation failure, list redaction, disable/enable, and rotate-secret one-time return.

### Step 4: Add an operator UI

Add either:

- a dedicated `/developer-apps` dashboard route, or
- an admin section inside `/applications`.

The page should:

- show only to admin users, based on the server's `403`/`200` response
- list managed clients
- create public and confidential clients
- edit redirect/logout URIs and display name
- rotate confidential client secrets with a one-time reveal
- disable/enable a client

Use the existing dashboard components and `SettingsCard` style. Do not show this UI to normal users as an empty or broken admin panel.

**Verify**: `pnpm lint` exits 0.

### Step 5: Preserve env-seeded bootstrap clients

Keep `OAUTH_CLIENTS` as a bootstrap path for the example client and emergency static clients unless official Better Auth docs indicate it should be removed. Update README to explain:

- `OAUTH_CLIENTS` is for local bootstrap/static clients
- admins can manage clients through the dashboard
- `ADMIN_EMAILS` controls access
- generated secrets are shown once and must be copied by the operator

**Verify**: `pnpm run build` exits 0.

### Step 6: Run full verification

**Verify**:

- `pnpm test` exits 0
- `pnpm lint` exits 0
- `pnpm run build` exits 0

## Test plan

- Extend `worker/app.test.ts` for admin auth, validation, redaction, create/update, disable/enable, and rotate-secret.
- Add UI tests only if the repo already has a UI test harness after drift; otherwise keep verification to lint/build.
- Use Plan 001's application API patterns for safe response shapes.

## Done criteria

- [ ] Admins can create, list, update, disable/enable, and rotate secrets for OAuth clients.
- [ ] Non-admin users receive `403`; unauthenticated requests receive `401`.
- [ ] Client secrets are never returned from list/get APIs and are returned only on create/rotate.
- [ ] The OAuth provider actually recognizes managed clients during authorization.
- [ ] README and `.dev.vars.example` document `ADMIN_EMAILS` and the managed-client workflow.
- [ ] `pnpm test`, `pnpm lint`, and `pnpm run build` exit 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- Better Auth's installed OAuth provider cannot use DB-backed managed clients.
- Better Auth requires generated schema or migration changes.
- The implementation would require inventing or bypassing OAuth provider internals.
- You cannot implement admin checks using server-verified session data.
- A requested endpoint would expose client secrets after creation/rotation.

## Maintenance notes

Reviewers should focus on whether managed clients are actually honored by the provider and whether secret handling is one-time only. Future organization/team support can replace `ADMIN_EMAILS`, but this plan should not invent a roles system.

