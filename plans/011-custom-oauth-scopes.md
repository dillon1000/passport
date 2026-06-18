# Plan 011: Add data-backed custom OAuth scopes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- package.json README.md .dev.vars.example src/auth.ts src/env.ts src/lib/oauth-scopes.ts src/lib/oauth-scope-claims.ts src/lib/oauth-scopes.test.ts src/lib/oauth-scope-claims.test.ts src/pages/Consent.tsx src/pages/Applications.tsx worker/app.ts worker/app.test.ts plans/README.md`
> and `git diff --stat -- package.json README.md .dev.vars.example src/auth.ts src/env.ts src/lib/oauth-scopes.ts src/lib/oauth-scope-claims.ts src/lib/oauth-scopes.test.ts src/lib/oauth-scope-claims.test.ts src/pages/Consent.tsx src/pages/Applications.tsx worker/app.ts worker/app.test.ts plans/README.md`.
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `dcbfe34`, 2026-06-15

## Why this matters

Passport is already an OAuth 2.1/OIDC provider, but apps can only request the
standard `openid`, `profile`, `email`, and `offline_access` scopes. The product
already stores profile images, organizations, memberships, and teams, so OAuth
clients should be able to request those data classes through explicit consented
scopes instead of receiving an all-or-nothing profile. The implementation must
use Better Auth's native OAuth provider hooks so scopes are enforced at
authorize/register time, advertised through discovery, rendered accurately on
consent, and materialized into OIDC userinfo/JWT claims.

Important product boundary: do not add a `relationships` scope in this plan.
There is no relationship table, API, or product definition in the repo today.
Returning an empty or invented relationship claim would make the provider
contract misleading. This plan adds the framework so a later relationship data
model can add a data-backed `relationships` scope in one obvious place.

## Current state

- `src/auth.ts` configures Better Auth's OAuth provider.
- `src/env.ts` parses `OAUTH_CLIENTS` seed clients.
- `src/db/schema.ts` already contains `user.image`, `organization`, `member`,
  `team`, `teamMember`, and OAuth scope/consent/token tables.
- `src/pages/Consent.tsx` renders standard scope copy from a local hardcoded
  object and passes unknown scope names through as raw text.
- `src/pages/Applications.tsx` lets admins type arbitrary space-separated
  scopes for managed OAuth clients.
- `worker/app.ts` accepts arbitrary non-empty scope strings in the admin OAuth
  client API.
- `worker/index.ts` passes admin client scopes to Better Auth as a space-joined
  `scope` string.

OAuth provider configuration:

```ts
// src/auth.ts:357-369
oauthProvider({
	loginPage: "/sign-in",
	consentPage: "/consent",
	disabledPaths: ["/token"],
	allowDynamicClientRegistration: true,
	clientRegistrationDefaultScopes: ["openid", "profile", "email"],
	clientRegistrationAllowedScopes: ["offline_access"],
	clientPrivileges: async ({ user }) => isAdminEmail(env, user?.email),
	silenceWarnings: {
		oauthAuthServerConfig: true,
	},
	scopes: ["openid", "profile", "email", "offline_access"],
```

Current consent scope copy:

```tsx
// src/pages/Consent.tsx:21-27
/** Human-readable copy + icon for the standard OIDC scopes; unknown scopes pass through. */
const SCOPE_META: Record<string, { label: string; icon: ComponentType<{ className?: string }> }> = {
	openid: { label: "Verify your identity", icon: Fingerprint },
	profile: { label: "Read your name and profile details", icon: UserRound },
	email: { label: "Read your email address", icon: Mail },
	offline_access: { label: "Stay signed in when you're away", icon: Clock },
};
```

Admin OAuth API input currently accepts any scope string:

```ts
// worker/app.ts:157-162
const createOAuthClientSchema = z.object({
	name: z.string().trim().min(1),
	redirectUris: oauthURLArray,
	postLogoutRedirectUris: oauthURLArray.optional(),
	scopes: z.array(z.string().trim().min(1)).optional(),
```

Admin OAuth API forwards scopes to Better Auth:

```ts
// worker/index.ts:147-157
create: async ({ request, env }, input) => {
	const client = (await auth(env as AuthEnv).api.adminCreateOAuthClient({
		headers: request.headers,
		body: {
			redirect_uris: input.redirectUris,
			client_name: input.name,
			client_uri: input.uri,
			logo_uri: input.icon,
			post_logout_redirect_uris: input.postLogoutRedirectUris,
			scope: input.scopes?.join(" "),
```

Data already available for custom claims:

```ts
// src/db/schema.ts:12-18
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
```

```ts
// src/db/schema.ts:97-107
export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: timestamp("created_at").notNull(),
    metadata: text("metadata"),
  },
```

```ts
// src/db/schema.ts:130-160
export const team = pgTable(
  "team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
...
export const teamMember = pgTable(
  "team_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
```

```ts
// src/db/schema.ts:164-180
export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
```

Better Auth OAuth provider facts to use:

- The installed package is `@better-auth/oauth-provider@1.6.18`.
- The docs at `https://better-auth.com/docs/plugins/oauth-provider` state that
  `/oauth2/userinfo` returns claims based on granted scopes and that
  `customUserInfoClaims`, `customIdTokenClaims`, `customAccessTokenClaims`, and
  `advertisedMetadata` are the extension points for custom scope-backed claims.
- The installed type file confirms `scopes`, `clientRegistrationDefaultScopes`,
  `clientRegistrationAllowedScopes`, `customUserInfoClaims`,
  `customIdTokenClaims`, `customAccessTokenClaims`, `customTokenResponseFields`,
  `scopeExpirations`, and `advertisedMetadata` are supported.

Repo conventions to match:

- Use pnpm only.
- Add concise file-level notes to new or meaningfully changed implementation
  files explaining purpose, inputs, outputs, and safe configuration points.
- Keep implementations obvious and local. Prefer a small scope registry and one
  claim builder over scattered literals.
- Tests use Vitest. Worker route tests use `createWorkerApp`, mocked services,
  and direct `app.fetch(...)` calls.
- UI follows `design.md`: neutral dashboard/auth surfaces, compact cards, Geist
  typography, restrained copy, and existing component primitives.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Targeted tests | `pnpm test -- src/lib/oauth-scopes.test.ts src/lib/oauth-scope-claims.test.ts worker/app.test.ts` | exit 0, new tests pass |
| Full tests | `pnpm test` | exit 0, all tests pass |
| Lint | `pnpm lint` | exit 0, no ESLint errors |
| Typecheck without build artifacts | `pnpm exec tsc -b --noEmit` | exit 0, no TypeScript errors |
| Production build | `pnpm run build` | exit 0; this may update `dist/` |

Recon baseline on 2026-06-15: `pnpm test`, `pnpm lint`, and
`pnpm exec tsc -b --noEmit` all passed in the current worktree. `pnpm run build`
was not run during planning because it writes build artifacts.

## Scope

**In scope** (the only files you should modify):

- `package.json`
- `README.md`
- `.dev.vars.example`
- `src/auth.ts`
- `src/env.ts`
- `src/lib/oauth-scopes.ts` (create)
- `src/lib/oauth-scope-claims.ts` (create)
- `src/lib/oauth-scopes.test.ts` (create)
- `src/lib/oauth-scope-claims.test.ts` (create)
- `src/pages/Consent.tsx`
- `src/pages/Applications.tsx`
- `worker/app.ts`
- `worker/app.test.ts`
- `plans/README.md`

**Out of scope** (do NOT touch, even though they look related):

- `src/db/schema.ts` and `drizzle/` migrations. The required data already
  exists; adding a relationship model is not part of this plan.
- `src/pages/Organizations.tsx`. Reuse existing organization/team data; do not
  expand lifecycle management here.
- `example-client/**`. Keep the demo unchanged unless a reviewer explicitly
  asks for a separate demo update.
- Better Auth package upgrades. Use the installed `@better-auth/oauth-provider`
  API.
- Resource-server authorization policy. This plan only issues consented claims;
  downstream APIs must still enforce their own permissions.

## Git workflow

- Branch: `feature/custom-oauth-scopes`
- Commit style: imperative, human-readable, no co-author trailer. Example from
  local history: `Publish Passport identity provider`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Scope contract

Implement these supported scopes:

| Scope | Meaning | Claims |
|---|---|---|
| `openid` | Standard OIDC identity scope | Existing Better Auth `sub` behavior |
| `profile` | Standard OIDC profile scope | Existing Better Auth profile claims; override `picture` to an absolute URL when possible |
| `email` | Standard OIDC email scope | Existing Better Auth email claims |
| `offline_access` | Standard refresh-token scope | Existing Better Auth refresh-token behavior |
| `profile:picture` | Narrow Passport scope for profile image only | `picture`, normalized to an absolute URL |
| `organizations` | Read the user's organization memberships | Namespaced `organizations` claim in userinfo; compact ids/roles in access token |
| `teams` | Read the user's team memberships | Namespaced `teams` claim in userinfo; compact ids in access token |

Do not implement:

- `relationships`: no data model exists. Document as a future scope requiring a
  relationship schema and product definition.
- Wildcard scopes such as `organizations:*`.
- Write scopes such as `organizations:write` or `teams:write`.

Use namespaced claim URLs derived from `env.BETTER_AUTH_URL`, for example:

- `new URL("/claims/organizations", env.BETTER_AUTH_URL).toString()`
- `new URL("/claims/teams", env.BETTER_AUTH_URL).toString()`
- `new URL("/claims/organization_roles", env.BETTER_AUTH_URL).toString()`

## Steps

### Step 1: Add a central OAuth scope registry

Create `src/lib/oauth-scopes.ts` with a file-level note. Keep it free of React,
database, Worker, and browser-only imports so `src/auth.ts`, Worker code, tests,
and React pages can all import it.

Export:

- `STANDARD_OAUTH_SCOPES = ["openid", "profile", "email", "offline_access"] as const`
- `PASSPORT_CUSTOM_OAUTH_SCOPES = ["profile:picture", "organizations", "teams"] as const`
- `SUPPORTED_OAUTH_SCOPES = [...STANDARD_OAUTH_SCOPES, ...PASSPORT_CUSTOM_OAUTH_SCOPES] as const`
- `DEFAULT_CLIENT_REGISTRATION_SCOPES = ["openid", "profile", "email"] as const`
- `CLIENT_REGISTRATION_ALLOWED_SCOPES = ["offline_access", "profile:picture", "organizations", "teams"] as const`
- `type SupportedOAuthScope = (typeof SUPPORTED_OAUTH_SCOPES)[number]`
- `type OAuthScopeDefinition = { scope: SupportedOAuthScope; label: string; description: string; consent: string; category: "identity" | "account" | "organization" }`
- `OAUTH_SCOPE_DEFINITIONS: Record<SupportedOAuthScope, OAuthScopeDefinition>`
- `isSupportedOAuthScope(value: string): value is SupportedOAuthScope`
- `unsupportedOAuthScopes(scopes: readonly string[]): string[]`
- `assertSupportedOAuthScopes(scopes: readonly string[], source: string): void`
- `defaultClientScopeString()` and `supportedScopeString()` helper functions

Suggested consent copy:

- `openid`: `Verify your identity`
- `profile`: `Read your name and profile details`
- `email`: `Read your email address`
- `offline_access`: `Stay signed in when you're away`
- `profile:picture`: `Read your profile picture`
- `organizations`: `Read your organization memberships`
- `teams`: `Read your team memberships`

`assertSupportedOAuthScopes` should throw a `TypeError` with a message that
includes the source and unsupported scope names, for example
`Unsupported OAuth scope in OAUTH_CLIENTS: relationships`.

Add `src/lib/oauth-scopes.test.ts` covering:

- all expected scopes are present;
- defaults are exactly `openid profile email`;
- `unsupportedOAuthScopes(["openid", "relationships"])` returns
  `["relationships"]`;
- `assertSupportedOAuthScopes(["relationships"], "test")` throws;
- no `relationships` scope is in `SUPPORTED_OAUTH_SCOPES`.

**Verify**: `pnpm test -- src/lib/oauth-scopes.test.ts` -> exit 0.

### Step 2: Build data-backed custom claim helpers

Create `src/lib/oauth-scope-claims.ts` with a file-level note explaining that
this file translates granted OAuth scopes plus current Passport data into
namespaced OIDC/userinfo/access-token claims. Keep the data loading and pure
claim shaping separate so the pure behavior is easy to test without a database.

Recommended exports:

- `type OAuthClaimUser = { id: string; image?: string | null }`
- `type OrganizationMembershipClaim = { id: string; name: string; slug: string; logo?: string | null; role: string }`
- `type TeamMembershipClaim = { id: string; name: string; organizationId: string; organizationName: string; organizationSlug: string }`
- `type OAuthClaimContext = { organizations: OrganizationMembershipClaim[]; teams: TeamMembershipClaim[] }`
- `oauthClaimUrl(env: Pick<AuthEnv, "BETTER_AUTH_URL">, name: string): string`
- `oauthClaimsSupported(env: Pick<AuthEnv, "BETTER_AUTH_URL">): string[]`
- `absoluteProfileImageUrl(env: Pick<AuthEnv, "BETTER_AUTH_URL">, image: string | null | undefined): string | undefined`
- `buildUserInfoScopeClaims(env, user, scopes, context): Record<string, unknown>`
- `buildIdTokenScopeClaims(env, user, scopes): Record<string, unknown>`
- `buildAccessTokenScopeClaims(env, user, scopes, context): Record<string, unknown>`
- `loadOAuthClaimContext(db, userId): Promise<OAuthClaimContext>`

Use Drizzle joins in `loadOAuthClaimContext`:

- organizations: `member` joined to `organization` by `member.organizationId`
  where `member.userId` equals the OAuth user id.
- teams: `teamMember` joined to `team`, then `organization`, where
  `teamMember.userId` equals the OAuth user id.

Claim behavior:

- If `profile` or `profile:picture` is granted and `user.image` exists, include
  standard `picture` with an absolute URL. If the stored image is already
  `http://` or `https://`, return it unchanged. If it starts with `/`, resolve
  it against `env.BETTER_AUTH_URL`.
- If `organizations` is granted, userinfo includes
  `<issuer>/claims/organizations` with organization membership objects.
- If `teams` is granted, userinfo includes `<issuer>/claims/teams` with team
  membership objects.
- Access-token claims should stay compact:
  - `<issuer>/claims/organization_ids`: string array when `organizations` or
    `teams` is granted.
  - `<issuer>/claims/organization_roles`: object mapping organization id to
    role when `organizations` is granted.
  - `<issuer>/claims/team_ids`: string array when `teams` is granted.
- ID-token claims should stay small: only `picture` from `profile` or
  `profile:picture`. Do not put full organization/team arrays in ID tokens.
- If `customAccessTokenClaims` receives no user, return `{}`. This preserves
  client-credentials behavior.

Add `src/lib/oauth-scope-claims.test.ts` covering:

- relative `/api/profile-images/...` paths become absolute URLs using
  `BETTER_AUTH_URL`;
- absolute image URLs pass through unchanged;
- `profile:picture` without `profile` still emits `picture`;
- `organizations` emits the namespaced organizations userinfo claim;
- `teams` emits the namespaced teams userinfo claim;
- access-token claims are compact ids/roles rather than full objects;
- no organization/team claims are emitted without their scopes.

**Verify**: `pnpm test -- src/lib/oauth-scope-claims.test.ts` -> exit 0.

### Step 3: Wire the registry and claims into Better Auth

Update `src/env.ts`:

- Add `scopes?: string[]` to `OAuthClientSeed`.
- Keep `parseOAuthClientSeeds` simple, but do not silently accept unsupported
  seed scopes downstream.

Update `src/auth.ts`:

- Import the registry values and claim helpers.
- Use `SUPPORTED_OAUTH_SCOPES` for `oauthProvider({ scopes })`.
- Use `DEFAULT_CLIENT_REGISTRATION_SCOPES` for
  `clientRegistrationDefaultScopes`.
- Use `CLIENT_REGISTRATION_ALLOWED_SCOPES` for
  `clientRegistrationAllowedScopes`.
- Add `advertisedMetadata` with:
  - `scopes_supported: SUPPORTED_OAUTH_SCOPES`
  - `claims_supported` including standard claims plus the namespaced Passport
    claims returned by the helpers.
- Add `customIdTokenClaims`, `customUserInfoClaims`, and
  `customAccessTokenClaims`.
- In each custom claim callback, call the helper only for supported scopes. For
  organization/team claims, load data through `createDb(env)` and
  `loadOAuthClaimContext(db, user.id)`. Return `{}` when there is no user.
- When mapping `trustedClients` from `OAUTH_CLIENTS`, pass through
  `scopes: client.scopes` after validating with `assertSupportedOAuthScopes`.

Suggested shape:

```ts
const oauthScopes = SUPPORTED_OAUTH_SCOPES;

oauthProvider({
	loginPage: "/sign-in",
	consentPage: "/consent",
	disabledPaths: ["/token"],
	allowDynamicClientRegistration: true,
	clientRegistrationDefaultScopes: DEFAULT_CLIENT_REGISTRATION_SCOPES,
	clientRegistrationAllowedScopes: CLIENT_REGISTRATION_ALLOWED_SCOPES,
	advertisedMetadata: {
		scopes_supported: oauthScopes,
		claims_supported: oauthClaimsSupported(env),
	},
	customIdTokenClaims: ({ user, scopes }) =>
		buildIdTokenScopeClaims(env, user, scopes),
	customUserInfoClaims: async ({ user, scopes }) => {
		const context = await loadOAuthClaimContext(db, user.id);
		return buildUserInfoScopeClaims(env, user, scopes, context);
	},
	customAccessTokenClaims: async ({ user, scopes }) => {
		if (!user) return {};
		const context = await loadOAuthClaimContext(db, user.id);
		return buildAccessTokenScopeClaims(env, user, scopes, context);
	},
	scopes: oauthScopes,
	trustedClients: parseOAuthClientSeeds(env.OAUTH_CLIENTS).map((client) => {
		if (client.scopes) assertSupportedOAuthScopes(client.scopes, "OAUTH_CLIENTS");
		return {
			clientId: client.id,
			clientSecret: client.secret,
			name: client.name,
			redirectURLs: client.redirectUris,
			postLogoutRedirectURLs: client.postLogoutRedirectUris,
			public: client.public,
			skipConsent: client.skipConsent,
			scopes: client.scopes,
		};
	}),
})
```

Do not copy this blindly if the live types require a small adjustment; match the
installed `@better-auth/oauth-provider@1.6.18` types.

**Verify**: `pnpm exec tsc -b --noEmit` -> exit 0.

### Step 4: Validate managed OAuth client scopes at Passport's API boundary

Update `worker/app.ts`:

- Import `unsupportedOAuthScopes` from `../src/lib/oauth-scopes`.
- Refine `createOAuthClientSchema` and `updateOAuthClientSchema` so
  `scopes` may only contain supported scopes.
- Return a clear 400 error such as
  `Unsupported OAuth scope: relationships` or
  `Unsupported OAuth scopes: relationships, admin`.
- Keep the existing service contract shape (`scopes?: string[]`) unchanged.

Add/adjust `worker/app.test.ts`:

- Add a test that POST `/api/admin/oauth-clients` with
  `scopes: ["openid", "relationships"]` returns 400 and does not call
  `adminOAuth.create`.
- Add a test that custom supported scopes such as
  `["openid", "profile:picture", "organizations", "teams"]` are accepted and
  passed to `adminOAuth.create`.
- Keep existing admin authorization tests unchanged.

**Verify**: `pnpm test -- worker/app.test.ts` -> exit 0.

### Step 5: Render custom scopes clearly in consent and admin UI

Update `src/pages/Consent.tsx`:

- Import `OAUTH_SCOPE_DEFINITIONS` or a lookup helper from
  `src/lib/oauth-scopes.ts`.
- Keep the local icon map in the component file because the shared scope
  registry must stay React-free.
- Add icons for custom scopes using lucide icons already available or new
  imports:
  - `profile:picture`: `Image`
  - `organizations`: `Building2`
  - `teams`: `UsersRound`
- Render `definition.consent` for known scopes and raw `scope` for unknown
  scopes. Unknown scopes should be rare because the provider rejects them, but
  the fallback keeps the page resilient.

Update `src/pages/Applications.tsx`:

- Use `defaultClientScopeString()` for new client defaults instead of a
  hardcoded `"openid profile email"`.
- Use `supportedScopeString()` for placeholder/help text where the admin enters
  scopes.
- Keep the UI as a compact textarea/input; do not build a large scope editor in
  this plan.
- If the page has scope chips, continue showing the raw scope name in monospace.
  Optionally add a `title` from the registry definition, but do not redesign the
  Applications page.

**Verify**: `pnpm exec tsc -b --noEmit` -> exit 0.

### Step 6: Document the scope contract and seed-client support

Update `.dev.vars.example`:

- Add `scopes` to the sample `OAUTH_CLIENTS` object, keeping default behavior:

```env
OAUTH_CLIENTS=[{"id":"example-client","secret":"example-client-secret","name":"Example Client","redirectUris":["http://localhost:5174/callback"],"postLogoutRedirectUris":["http://localhost:5174/"],"scopes":["openid","profile","email"],"skipConsent":true}]
```

Update `README.md`:

- Add a "Custom OAuth Scopes" section near "Verifying Tokens" or "Registering
  New Apps".
- Document the supported scopes and what data they disclose.
- Document that `profile` is standard OIDC and already includes profile
  information, while `profile:picture` is the narrower Passport scope for only
  the profile picture URL.
- Document claim names:
  - `picture`
  - `{issuer}/claims/organizations`
  - `{issuer}/claims/teams`
  - `{issuer}/claims/organization_ids`
  - `{issuer}/claims/organization_roles`
  - `{issuer}/claims/team_ids`
- Document that `relationships` is intentionally not supported until Passport
  has a relationship data model.

Update `package.json`:

- Bump the patch version from the live version. At planning time the version is
  `0.0.1`, so this plan would normally bump it to `0.0.2`. If another plan has
  already changed the version, increment the live patch version by one instead
  of resetting it.

**Verify**:

- `rg -n "profile:picture|organizations|teams|relationships" README.md` ->
  finds the new custom-scope documentation.
- `node -e "const p=require('./package.json'); if (p.version === '0.0.1') process.exit(1)"` -> exit 0.

### Step 7: Run the full verification gates

Run:

```bash
pnpm test
pnpm lint
pnpm exec tsc -b --noEmit
pnpm run build
```

Expected result:

- all commands exit 0;
- the test count increases by the new registry/claim/API tests;
- no TypeScript errors from Better Auth callback types;
- build completes after `tsc -b && vite build`.

If `pnpm run build` changes `dist/`, leave the generated build output in place
only if this repo normally tracks `dist/` for deployment. If the operator does
not want build artifacts committed, ask before staging or committing.

## Test plan

- `src/lib/oauth-scopes.test.ts`
  - registry contains exact supported/default/allowed scopes;
  - unsupported scope detection rejects `relationships`;
  - supported custom scopes pass validation.
- `src/lib/oauth-scope-claims.test.ts`
  - absolute profile image URL behavior;
  - `profile:picture` emits `picture` without needing full `profile`;
  - organization/team claims only appear when their scopes are granted;
  - access-token claims stay compact.
- `worker/app.test.ts`
  - admin OAuth client creation rejects unsupported scopes before calling the
    service;
  - admin OAuth client creation accepts `profile:picture`, `organizations`, and
    `teams`.
- Existing tests:
  - `src/routes.test.tsx` should not need changes unless route imports drift.
  - Existing OAuth admin tests in `worker/app.test.ts` must keep passing.

## Done criteria

ALL must hold:

- [ ] `SUPPORTED_OAUTH_SCOPES` includes `openid`, `profile`, `email`,
  `offline_access`, `profile:picture`, `organizations`, and `teams`.
- [ ] `SUPPORTED_OAUTH_SCOPES` does not include `relationships`.
- [ ] Better Auth `oauthProvider` uses the shared registry for `scopes`,
  dynamic registration defaults/allowed scopes, and advertised metadata.
- [ ] `customIdTokenClaims`, `customUserInfoClaims`, and
  `customAccessTokenClaims` are wired and return only claims allowed by granted
  scopes.
- [ ] Profile picture URLs emitted by custom claims are absolute URLs.
- [ ] Organization/team claims are loaded from existing membership/team tables.
- [ ] Admin OAuth client APIs reject unsupported scopes with HTTP 400.
- [ ] Consent UI shows human-readable copy for all supported scopes.
- [ ] README documents supported custom scopes and explicitly says
  `relationships` is future work.
- [ ] `package.json` patch version is bumped from the live starting version.
- [ ] `pnpm test` exits 0.
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm exec tsc -b --noEmit` exits 0.
- [ ] `pnpm run build` exits 0.
- [ ] No files outside the in-scope list are modified unless the operator
  explicitly approved build artifacts.
- [ ] `plans/README.md` status row for plan 011 is updated if execution is
  complete.

## STOP conditions

Stop and report back (do not improvise) if:

- The live Better Auth OAuth provider types do not expose
  `customIdTokenClaims`, `customUserInfoClaims`, `customAccessTokenClaims`, or
  `advertisedMetadata`.
- Implementing organization/team claims requires a database migration.
- You find an existing relationship model/API and are tempted to add
  `relationships`; that is a separate product decision and should get its own
  plan.
- The provider rejects `profile:picture`, `organizations`, or `teams` even
  after they are included in `oauthProvider.scopes`.
- `pnpm exec tsc -b --noEmit` fails twice on Better Auth callback typing after
  reasonable local type adjustments.
- A step requires changing files outside the in-scope list.

## Maintenance notes

- Future scopes should be added in this order: registry definition, claim
  helper behavior, provider metadata, consent copy/icon, admin API validation,
  tests, README.
- Keep large arrays out of ID tokens. Put detailed data in `/oauth2/userinfo`
  and compact identifiers/roles in access tokens.
- If Passport later adds write scopes, add `scopeExpirations` for high-risk
  scopes and require a separate review of consent copy and downstream resource
  authorization.
- If Passport adds a relationship data model, implement `relationships` as a
  new data-backed scope. Do not ship a placeholder claim.
