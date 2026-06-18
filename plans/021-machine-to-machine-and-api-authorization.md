# Plan 021: Machine-to-machine tokens and API authorization

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- src/lib/auth-server/oauth.ts src/lib/oauth-scopes.ts src/db/schema.ts worker/app.ts worker/index.ts src/pages/Applications.tsx .dev.vars.example README.md plans/README.md`
> and the same with no commit range for the working tree. If any in-scope or
> recon-input file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.
>
> **Recon gate (run before writing any code)**: this plan assumes the installed
> `@better-auth/oauth-provider@1.6.18` already implements the `client_credentials`
> grant, `resource`/`audience` handling, and the `clientCredentialGrantDefaultScopes`
> / `grantTypes` / `customTokenResponseFields` options. Confirm with the recon
> commands below before relying on any of them. If the installed plugin's shape
> differs from the excerpts here, STOP and report.

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: none (pairs with plan 022 — introspection/revocation make M2M tokens verifiable; build 022 first or alongside)
- **Category**: direction (closes the "Sign in with ACME" → "build on ACME" gap)
- **Planned at**: commit `dcbfe34`, 2026-06-18

## Why this matters

Passport is the self-hosted identity provider an organization runs to be its own
"Sign in with ACME". Today it authenticates **users** well, but the moment one of
ACME's own backends, scripts, or scheduled jobs needs to call an ACME API with no
human in the loop, there is no first-class credential for it. That machine-to-machine
(M2M) path — plus a way to say "this token is allowed to call *that* API" — is the
single feature that turns a login button into a platform other services build on.
It is the Auth0 "Machine to Machine Applications" + "APIs (audiences)" pairing.

The good news from recon: the engine already exists. The installed
`@better-auth/oauth-provider@1.6.18` ships `client_credentials` as a **default**
grant type and already understands `resource`/`audience` (RFC 8707 resource
indicators). The `oauthApplication` table already has a `grantTypes` array column.
So this plan is mostly: let an operator mark a client as M2M, model the set of
protected APIs (audiences) and which scopes each may grant, set `aud` correctly on
issued tokens, and surface all of it in the Applications UI, provider metadata, and
docs. It is wiring and modelling, not building OAuth from scratch.

## Current state

- `src/lib/auth-server/oauth.ts` — `oauthProviderPlugin(env, db)` configures the
  provider (`src/lib/auth-server/oauth.ts:63-104`). It sets `loginPage`,
  `consentPage`, `disabledPaths: ["/token"]` (this disables the **jwt plugin's**
  generic `/token`, not `/oauth2/token`), `allowDynamicClientRegistration`,
  `clientRegistrationDefaultScopes`, `clientRegistrationAllowedScopes`,
  `clientPrivileges`, `advertisedMetadata` (`scopes_supported`, `claims_supported`),
  the three `custom*Claims` callbacks, `scopes`, and `trustedClients` seeded from
  `env.OAUTH_CLIENTS`. It does **not** set `grantTypes`,
  `clientCredentialGrantDefaultScopes`, `resources`, or `customTokenResponseFields`.
- Installed plugin capabilities (verify in recon; observed in
  `node_modules/@better-auth/oauth-provider/dist/oauth-D74mBkw6.d.mts` at 1.6.18):
  - `grantTypes?: GrantType[]` — default `["authorization_code", "client_credentials", "refresh_token"]`.
  - `clientCredentialGrantDefaultScopes?: Scopes` — default scopes for DB clients
    registered without an explicit scope list under the `client_credentials` grant.
  - `customTokenResponseFields?: (info: { grantType; user?; scopes; metadata?; ... }) => ...`
    — the type comment states `user` is "Undefined for `client_credentials` (M2M, no user)".
  - `resources` / `resource?:` / `audience` / `aud` — resource-indicator and
    audience plumbing exists.
  - `pairwiseSecret`, `disableJwtPlugin`, `cachedTrustedClients`,
    `allowUnauthenticatedClientRegistration` also exist (not needed here, but note
    `cachedTrustedClients` vs the `trustedClients` the code currently passes — confirm
    which key the installed version honors).
- `src/db/schema.ts` — the `oauthApplication` table already has
  `grantTypes: text("grant_types").array()` (`src/db/schema.ts:408`), `public:
  boolean("public")` (`:410`), and `metadata: jsonb("metadata")` (`:414`). The
  `oauthAccessToken` table (`:452-476`) stores `clientId`, `sessionId`, `userId`,
  `refreshId` — i.e. a client-only token with no `userId`/`sessionId` is already
  representable. **No new table is required to mark a client M2M.**
- `worker/app.ts` — already proxies the provider's protocol surface: `PROXIED`-style
  prefixes include `/oauth2/`, `/.well-known/oauth-authorization-server`, and
  `/.well-known/openid-configuration` (`worker/app.ts:361-363`). The token endpoint
  (`/oauth2/token`) is therefore already reachable for all enabled grants.
- `src/lib/oauth-scopes.ts` — the central scope registry
  (`STANDARD_OAUTH_SCOPES`, `PASSPORT_CUSTOM_OAUTH_SCOPES`, `SUPPORTED_OAUTH_SCOPES`,
  `OAUTH_SCOPE_DEFINITIONS`, `assertSupportedOAuthScopes`). Every new scope/contract
  string must be added here first so metadata, validation, and consent copy stay
  aligned.
- `src/pages/Applications.tsx` — admin client management UI. The create/edit form
  models `redirectUris`, `postLogoutRedirectUris`, `public`, and `clientSecret`
  (rotate-secret flow around `:480-494`). There is **no** grant-type or client-type
  selector and no resource/audience association today.
- `.dev.vars.example` — documents the `OAUTH_CLIENTS` JSON seed (line ~58) and the
  one-line-comment-per-key convention. There is no resource/audience config key yet.

Repo conventions to match (`AGENTS.md`, `goal.md`, `README.md`):

- pnpm only; never npm/yarn.
- Bump root `package.json` version on every change.
- Workers runtime: Web-standard APIs only, no Node built-ins. Use `crypto.subtle`.
- Migrations are generated (Better Auth CLI generate → `pnpm db:generate`), never
  hand-written. Only generate a migration if recon proves a new column/table is
  genuinely required (this plan expects **none**).
- No `any`; new types go in the right module per `coding-standards`.
- File-level purpose/inputs/outputs comment at the top of any new file.
- Fight for the obvious solution; avoid feature creep.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Confirm client_credentials + options in installed plugin | `rg -n "client_credentials\|clientCredentialGrantDefaultScopes\|grantTypes\|customTokenResponseFields\|resource\|audience" node_modules/@better-auth/oauth-provider/dist/*.d.mts` | options/grants present at 1.6.18 |
| Confirm token endpoint is proxied | `rg -n "oauth2\|/token\|well-known" worker/app.ts` | `/oauth2/` proxied (~`worker/app.ts:361`) |
| Confirm grantTypes column exists | `rg -n "grant_types\|grantTypes" src/db/schema.ts` | `src/db/schema.ts:408` |
| Local run | `pnpm dev` | provider + UI boot |
| Tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build (typecheck + bundle) | `pnpm run build` | exit 0 (`tsc -b && vite build`) |

## Scope

**In scope** (the files you may modify):

- `src/lib/auth-server/oauth.ts` — enable/affirm `grantTypes`, set
  `clientCredentialGrantDefaultScopes`, wire `resources`/audience, and use
  `customTokenResponseFields` only if a custom field is actually required.
- `src/lib/oauth-scopes.ts` — if M2M needs distinct API/permission scope strings,
  register them here.
- `src/lib/oauth-resources.ts` (create, if recon picks the env-seed model) — the API
  (audience) registry: identifier + human label + the scopes each resource may grant.
- `worker/app.ts`, `worker/index.ts` — admin client mutations must accept/persist a
  client's grant types and (if modelled) its allowed audiences; reads must return
  them.
- `src/pages/Applications.tsx` — a client-type / grant-type selector (e.g.
  "Web/SPA (authorization code)" vs "Machine-to-machine (client credentials)"), and,
  for M2M clients, which API(s) they may request and which scopes.
- `.dev.vars.example` — new config keys (resource/audience seed) with one-line
  comments.
- `README.md` — document the M2M flow and the API/audience model.
- `docs/machine-to-machine.md` (create) — integrator guide: requesting a token via
  `client_credentials`, the `aud`/scope contract, and how a resource server validates
  it (link to plan 022's introspection/JWKS guidance).
- `package.json` (version bump), `plans/README.md` (status).

**Recon-only inputs** (read to ground the work; do NOT modify):

- `node_modules/@better-auth/oauth-provider` types at 1.6.18.
- `src/lib/auth-server/plugins.ts`, `src/lib/auth-server/config.ts` (plugin order,
  jwt plugin config, `disabledPaths`).
- `src/db/schema.ts` `oauthApplication` / `oauthAccessToken` tables.

**Out of scope for this plan** (do NOT do these here):

- Adopting the `apiKey` plugin. Recon shows it is **not exported** by the installed
  `better-auth@1.6.18` (`better-auth/plugins` has no `apiKey`). Treat static API keys
  as a separate, later evaluation (see Maintenance notes). `client_credentials` is the
  standards-based M2M path and is available now; do not introduce a second credential
  system in this plan.
- Introspection / revocation endpoints and refresh-token rotation — that is plan 022.
  This plan may **reference** them for the resource-server validation story but must
  not implement them.
- A DB-backed "APIs" management UI with full CRUD, unless recon shows the env-seed
  model cannot express what an M2M token needs. Prefer the env-seed model first
  (mirrors `OAUTH_CLIENTS`).
- Per-API rate limiting / quotas.

## Git workflow

- Branch: `feature/m2m-api-authorization` (human-readable per `AGENTS.md`; do NOT
  create `claude/*` or worktree-style branches).
- Do NOT push or open a PR unless the operator explicitly instructs it.

## Implementation steps

### 1. Recon and decide the audience model (STOP-gated)

Run the recon commands. Confirm at the installed version: `client_credentials` is in
the default `grantTypes`; `clientCredentialGrantDefaultScopes` exists; `resource`/
`audience` are honored on the authorize/token path and reflected as `aud` on issued
tokens. Decide the **audience model**:

- **Recommended — env-seed registry** (`OAUTH_RESOURCES`, mirroring `OAUTH_CLIENTS`):
  a JSON array of `{ identifier, name, scopes }`. An M2M client requests one resource
  via the `resource` parameter; the issued token's `aud` is that identifier and its
  granted scopes are the intersection of the client's allowed scopes and the
  resource's scopes. Simple, deploy-time, no migration.
- **Only if env-seed is insufficient** — a `resource_server` table + admin UI. This
  adds a generated migration and CRUD; justify in the doc before choosing it.

If the plugin does not actually populate `aud` from `resource`, STOP and report — the
audience contract is the point of the plan and must not be faked.

### 2. Enable and configure the grant in `oauth.ts`

- Affirm `grantTypes` explicitly (even though it defaults on) so the supported grants
  are self-documenting and metadata-driven.
- Set `clientCredentialGrantDefaultScopes` to a conservative default (e.g. none, or a
  single low-privilege scope) so a DB client without explicit scopes does not silently
  receive everything.
- Pass the `resources` list from the chosen audience registry.
- Use `customTokenResponseFields` only if a specific extra field is required; do not
  add fields speculatively. Remember `user` is undefined for `client_credentials`.
- Ensure `customAccessTokenClaims` handles the no-user case (it already early-returns
  `{}` when `!user`, per `src/lib/auth-server/oauth.ts:86-92`) and emits the correct
  `aud`/scope claims for M2M tokens.

### 3. Persist and expose grant type + audiences on clients

- In `worker/index.ts` / `worker/app.ts` admin client create/update, accept the
  client's grant types (validated against the supported set) and, if modelled, its
  allowed audience identifiers; persist to the existing `grantTypes` column (and
  `metadata` jsonb for audience allow-lists if no dedicated column is added).
- Reads (`/api/admin/oauth-clients`) must return grant types + allowed audiences so
  the UI can render them.
- Enforce: an M2M (`client_credentials`) client must be confidential (`public: false`)
  and must have a secret. Reject a public M2M client at the API boundary with a clear
  error.

### 4. Applications UI

- Add a client-type selector to the create form in `src/pages/Applications.tsx`:
  "Web / SPA — authorization code + PKCE" (current behavior) vs "Machine-to-machine —
  client credentials". Selecting M2M hides redirect-URI fields (not used by
  `client_credentials`) and forces confidential + secret display once.
- For M2M clients, let the admin pick which API(s)/audience(s) the client may request
  and which scopes, constrained to the registry from step 1.
- Show the issued client credentials once (reuse the existing one-time-secret pattern
  around `src/pages/Applications.tsx:248-494`).

### 5. Metadata, docs, and config

- Reflect supported grant types in `advertisedMetadata` so
  `/.well-known/oauth-authorization-server` advertises
  `grant_types_supported` truthfully.
- Add the resource/audience seed key(s) to `.dev.vars.example` with one-line comments.
- Write `docs/machine-to-machine.md`: a copy-pasteable `curl` for the
  `client_credentials` request to `/oauth2/token`, the `aud`/scope contract, and how a
  resource server validates the token (JWKS verify and/or `/oauth2/introspect` —
  cross-link plan 022). Update `README.md`'s feature list.

### 6. Verify end to end

Use the local provider (`pnpm dev`) plus the example client where useful:

- Request a token with `grant_type=client_credentials` + client secret + a `resource`;
  confirm a token is returned, `aud` matches the requested resource, and scopes are the
  intersection (not the full set).
- Confirm a public client cannot obtain a `client_credentials` token.
- Confirm an authorization-code client still works unchanged (no regression).
- Confirm `/.well-known/oauth-authorization-server` lists the grants.

## Test plan

- Unit: scope/audience intersection logic and the M2M client validation
  (confidential-only, secret required) in the worker service layer. Co-locate with the
  existing OAuth client tests; mock per `testing` skill.
- Unit: `oauth-resources` registry parsing/validation (malformed `OAUTH_RESOURCES`
  rejected with a clear error, mirroring `parseOAuthClientSeeds`).
- Route/integration: the admin create/update path persists and returns grant types +
  audiences; reject path for public M2M clients.
- Do not add a live network test against `/oauth2/token`; verify token shape via the
  claim-builder unit tests and a manual `pnpm dev` check recorded in the PR notes.
- Baseline: `pnpm test`, `pnpm lint`, `pnpm run build` all green.

## Done criteria

ALL must hold:

- [ ] An operator can create a machine-to-machine client in the Applications UI and
      receive credentials once.
- [ ] `POST /oauth2/token` with `grant_type=client_credentials` returns a token whose
      `aud` is the requested resource and whose scopes are the client∩resource
      intersection.
- [ ] Public/secret-less clients cannot use `client_credentials`.
- [ ] Authorization-code login is unchanged (no regression in the example client).
- [ ] `/.well-known/oauth-authorization-server` advertises the supported grant types.
- [ ] `docs/machine-to-machine.md` exists with a working request example and a
      resource-server validation section linking plan 022.
- [ ] No `apiKey` plugin was added; no unnecessary migration was generated.
- [ ] `pnpm test`, `pnpm lint`, `pnpm run build` pass; root `package.json` version
      bumped; `plans/README.md` marks 021 DONE.

## STOP conditions

Stop and report (do not improvise) if:

- The installed plugin does not actually set `aud` from the `resource` parameter, or
  `client_credentials` is not honored at 1.6.18 — the audience contract is the whole
  point and must not be simulated.
- Marking a client M2M would require a new migration beyond the existing `grantTypes`/
  `metadata` columns — surface the schema need and confirm before generating.
- Enabling `client_credentials` changes behavior of the existing authorization-code or
  refresh flows in any observable way.
- Recon shows `apiKey` *is* exported at the installed version and the operator wants it
  instead — that changes the credential model; stop and confirm direction.

## Maintenance notes

- Keep the audience model boring: env-seed first, DB-backed APIs only on real demand.
  This matches the deferred-until-demanded posture used for SCIM/SSO in
  `plans/README.md`.
- The `apiKey` plugin (static, long-lived keys with per-key scopes/rate-limits) is a
  reasonable *complementary* credential for low-ceremony integrations, but it is not
  exported at `better-auth@1.6.18`. Revisit only after a Better Auth upgrade confirms
  the export, and only if there is demand for static keys that `client_credentials`
  does not serve. Do not run two credential systems without a reason.
- Organization-owned M2M clients are a natural extension once plan 016 (org-owned
  OAuth clients) lands: an org could own its own machine credentials scoped to its
  tenant. Keep the grant-type/audience plumbing org-aware enough not to block that.
