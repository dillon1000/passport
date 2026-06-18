# Plan 022: Token introspection, revocation, and refresh-token rotation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- src/lib/auth-server/oauth.ts src/lib/auth-server/plugins.ts worker/app.ts README.md docs plans/README.md`
> and the same with no commit range for the working tree. If any in-scope or
> recon-input file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.
>
> **Recon gate (run before writing any code)**: recon at the pinned
> `@better-auth/oauth-provider@1.6.18` shows `/oauth2/introspect` (RFC 7662) and
> `/oauth2/revoke` (RFC 7009) are **already registered**, and that a new refresh
> token is issued on every refresh (rotation). This plan is therefore largely
> *verify, advertise, document, and test* — not build. Confirm the endpoints
> respond before assuming anything below; if they are absent or behave
> differently at the installed version, STOP and report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none (pairs with plan 021 — these endpoints are how a resource
  server validates the M2M tokens that plan issues)
- **Category**: direction (protocol completeness a relying-party developer expects)
- **Planned at**: commit `dcbfe34`, 2026-06-18

## Why this matters

A relying party that integrates "Sign in with ACME" — and especially a resource
server validating tokens from plan 021 — expects three standard things from a serious
OAuth provider: **token introspection** (RFC 7662) to ask "is this token still
valid and what's in it?", **token revocation** (RFC 7009) to kill a token before it
expires, and **refresh-token rotation with reuse detection** so a leaked refresh
token cannot be replayed. Their absence is the kind of gap that makes an integrator
reach for Keycloak instead.

Recon turned up that the installed `@better-auth/oauth-provider@1.6.18` already
registers `/oauth2/introspect` and `/oauth2/revoke`, and already rotates refresh
tokens ("issues a new refresh token for every refresh request"). `worker/app.ts`
already proxies `/oauth2/*`. So the real work is: **prove** these behave correctly,
**advertise** them in discovery metadata so integrators can find them, **document**
the verification recipes, add **regression tests**, and make a deliberate decision
about **refresh-token reuse detection** (confirm whether the plugin invalidates a
rotated token's lineage on reuse, and close the gap if it does not). This is a
high-leverage, low-build plan: it makes capabilities Passport *already has* legible
and trustworthy.

## Current state

- `src/lib/auth-server/oauth.ts` — `oauthProviderPlugin` (`:63-104`) does not set any
  introspection/revocation options explicitly and does not list those endpoints in
  `advertisedMetadata` (`:75-78` advertises only `scopes_supported` and
  `claims_supported`). `disabledPaths: ["/token"]` (`:67`) disables the **jwt
  plugin's** generic `/token`, not the OAuth `/oauth2/token` or the introspect/revoke
  paths.
- Installed plugin (verify in recon; observed at 1.6.18 in
  `node_modules/@better-auth/oauth-provider/dist/oauth-D74mBkw6.d.mts`): `/oauth2/introspect`
  ("RFC7662-compliant Introspection") and `/oauth2/revoke` ("RFC7009-compliant
  Revocation") are part of the registered path set; refresh-token rotation is built
  into the authorization-code and refresh flows.
- `worker/app.ts` — proxies `/oauth2/` and the two `.well-known` documents
  (`worker/app.ts:361-363`), so introspect/revoke are already reachable; they are not
  separately allow-listed or documented anywhere.
- `src/lib/auth-server/plugins.ts` — the `jwt` plugin (`:279-286`) issues RS256 JWT
  access tokens with `disableSettingJwtHeader: true`. Because access tokens are JWTs,
  a resource server can also validate them statelessly via `/jwks` — introspection is
  the complementary stateful check (revocation/expiry). The doc must explain both and
  when each is appropriate.
- `src/db/schema.ts` — `oauthAccessToken` (`:452-476`) carries `refreshId` and is
  indexed by it (`oauthAccessToken_refreshId_idx`), which is the structural hook
  rotation/reuse detection would rely on.
- No tests today assert introspection/revocation responses, and the README's feature
  list does not mention either endpoint or rotation.

Repo conventions to match (`AGENTS.md`, `goal.md`, `README.md`): pnpm only; version
bump on every change; Workers-only Web APIs; generated migrations only; no `any`;
file-level header comments; avoid feature creep.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Confirm introspect/revoke registered | `rg -n "introspect\|revoke\|revocation" node_modules/@better-auth/oauth-provider/dist/*.d.mts` | both present at 1.6.18 |
| Confirm refresh rotation semantics | `rg -n "refresh\|rotat\|reuse\|refreshId" node_modules/@better-auth/oauth-provider/dist/*.d.mts` | new refresh issued per request; check for reuse handling |
| Confirm proxy coverage | `rg -n "oauth2\|well-known" worker/app.ts` | `/oauth2/` proxied (~`:361`) |
| Local run | `pnpm dev` | provider boots |
| Tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm run build` | exit 0 |

## Scope

**In scope** (the files you may modify):

- `src/lib/auth-server/oauth.ts` — add introspection/revocation endpoints to
  `advertisedMetadata` (`introspection_endpoint`, `revocation_endpoint`, and the
  `*_endpoint_auth_methods_supported` entries) and set any explicit rotation/reuse
  option the plugin exposes (only if the default is not already secure).
- `docs/token-validation.md` (create) — integrator guide: introspection request/
  response, revocation request, JWKS-based stateless validation, refresh rotation
  behavior, and how a client must replace its stored refresh token after each refresh.
- `README.md` — list introspection, revocation, and rotation in the feature set.
- `worker/app.ts` — only if recon shows introspect/revoke are *not* already covered by
  the `/oauth2/` proxy prefix and need an explicit allow-list entry.
- Test files alongside the existing worker/provider tests.
- `package.json` (version bump), `plans/README.md` (status).

**Recon-only inputs** (read to ground the work; do NOT modify):

- `node_modules/@better-auth/oauth-provider` types at 1.6.18.
- `src/lib/auth-server/plugins.ts` (jwt plugin), `src/db/schema.ts`
  (`oauthAccessToken`, `refreshId`).

**Out of scope for this plan** (do NOT do these here):

- Building introspection/revocation handlers by hand. If recon proves the plugin
  endpoints exist, use them; do not reimplement RFC 7662/7009.
- Changing access-token format (JWT vs opaque) or touching `disableJwtPlugin` /
  `disabledPaths`.
- M2M client wiring and the audience model — that is plan 021.
- A token-management UI for end users (the activity log from plan 020 and the
  authorized-applications revocation from plan 001 already cover user-facing
  visibility; do not duplicate).

## Git workflow

- Branch: `feature/token-introspection-revocation` (human-readable; no `claude/*`).
- Do NOT push or open a PR unless the operator explicitly instructs it.

## Implementation steps

### 1. Verify the three behaviors against a running provider (STOP-gated)

With `pnpm dev`:

- **Introspection**: obtain an access token (authorization-code via the example
  client, or `client_credentials` if plan 021 has landed), then
  `POST /oauth2/introspect` with client authentication and `token=<token>`. Confirm
  `{ "active": true, ... }` with the expected `scope`, `client_id`, `exp`, and `aud`,
  and that an unknown/expired token returns `{ "active": false }` (per RFC 7662 §2.2,
  never an error for an invalid token).
- **Revocation**: `POST /oauth2/revoke` with `token=<refresh_or_access_token>`;
  confirm `200`, then confirm a subsequent introspection of the same token reports
  `active: false` and that a refresh using a revoked refresh token fails.
- **Rotation**: perform a refresh; confirm a **new** refresh token is returned and the
  **old** refresh token no longer works (reuse should fail). If the old token still
  works, that is a reuse-detection gap — record it and address in step 3.

If any endpoint 404s or behaves contrary to the RFCs, STOP and report; do not paper
over it with a custom handler without confirming direction.

### 2. Advertise the endpoints in discovery metadata

Add to `advertisedMetadata` in `src/lib/auth-server/oauth.ts` so
`/.well-known/oauth-authorization-server` (and `/.well-known/openid-configuration`
where applicable) expose:

- `introspection_endpoint` and `revocation_endpoint` absolute URLs.
- `introspection_endpoint_auth_methods_supported` and
  `revocation_endpoint_auth_methods_supported` matching how the plugin authenticates
  callers (confirm from recon — likely `client_secret_basic` / `client_secret_post`).

Only add fields the plugin actually honors; do not advertise an auth method the
endpoint rejects.

### 3. Confirm or close refresh-token reuse detection

If step 1 showed the rotated (old) refresh token is correctly invalidated, document
that and move on. If a reused refresh token still works:

- Check for a plugin option that enables reuse detection / lineage invalidation; set
  it if present.
- If no option exists, record it as a STOP/finding rather than building a bespoke
  lineage tracker in this plan — reuse detection touching token storage is a larger,
  riskier change that deserves its own scoped decision. Note the `refreshId` index
  (`src/db/schema.ts:476`) as the hook a future implementation would use.

### 4. Document the validation recipes

Write `docs/token-validation.md` covering, for a relying party / resource server:

- **Stateless** validation: fetch `/jwks`, verify the RS256 JWT with `jose`, check
  `iss`, `aud`, `exp`, and required scopes. State the trade-off: fast, but cannot see
  a revocation until the token expires.
- **Stateful** validation: call `/oauth2/introspect` for authoritative
  active/revoked status; recommend it for high-value operations.
- **Revocation**: how and when a client revokes (logout, key compromise).
- **Refresh rotation**: clients MUST persist and use the newest refresh token after
  each refresh; reusing an old one will fail (and, if reuse detection is on, may
  invalidate the lineage).

Update `README.md`'s feature list to mention introspection, revocation, and rotation.

### 5. Regression tests

Add tests asserting the documented contracts so they cannot silently regress on a
future plugin bump:

- Introspection returns `active: true` for a valid token and `active: false` (200, not
  error) for an invalid/expired one.
- Revocation returns 200 and the token is then inactive.
- Discovery metadata includes `introspection_endpoint` and `revocation_endpoint`.

Mock per the `testing` skill; co-locate with existing provider/worker tests.

## Test plan

- Unit/route tests for the three contracts above plus the metadata assertion.
- Manual `pnpm dev` walkthrough (step 1) recorded in PR notes for the parts that need a
  live token exchange.
- Baseline: `pnpm test`, `pnpm lint`, `pnpm run build` all green.

## Done criteria

ALL must hold:

- [ ] `/oauth2/introspect` and `/oauth2/revoke` are verified working and behave per
      RFC 7662/7009 (invalid token → `active: false`, not an error; revoked token →
      inactive).
- [ ] Refresh-token rotation is verified; reuse of an old refresh token fails, and the
      reuse-detection status (built-in / option-enabled / documented gap) is recorded.
- [ ] Discovery metadata advertises `introspection_endpoint` and `revocation_endpoint`
      with correct auth methods.
- [ ] `docs/token-validation.md` documents stateless + stateful validation, revocation,
      and rotation; README feature list updated.
- [ ] Regression tests cover introspection, revocation, and the metadata fields.
- [ ] No RFC endpoint was reimplemented by hand; no token-format changes were made.
- [ ] `pnpm test`, `pnpm lint`, `pnpm run build` pass; root `package.json` version
      bumped; `plans/README.md` marks 022 DONE.

## STOP conditions

Stop and report (do not improvise) if:

- An endpoint is missing or non-conformant at the installed version — confirm whether
  to upgrade the plugin or build a handler before doing either.
- Refresh-token reuse still succeeds and there is no plugin option to fix it — building
  bespoke lineage invalidation is out of scope for this plan; surface it as a separate
  decision.
- Advertising an endpoint auth method causes the endpoint to reject previously working
  callers (metadata must describe real behavior).

## Maintenance notes

- This plan deliberately treats the endpoints as **already built**; its value is
  legibility (metadata + docs + tests), which is exactly what an open-source self-host
  competitor (Keycloak/Zitadel) ships and what an integrator checks for.
- Keep `docs/token-validation.md` aligned with plan 021's `docs/machine-to-machine.md`
  — the M2M guide should link here for "how a resource server validates the token".
- On any `@better-auth/oauth-provider` upgrade, re-run the step-1 walkthrough; the
  regression tests guard the contracts but the manual check guards behavior the tests
  cannot easily exercise (live token exchange).
