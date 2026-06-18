# Plan 018: Design back-channel logout and session propagation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- package.json README.md docs src/auth.ts src/db/schema.ts src/pages/Sessions.tsx src/lib/session.ts worker/index.ts worker/app.ts plans/README.md`
> and `git diff --stat -- package.json README.md docs src/auth.ts src/db/schema.ts src/pages/Sessions.tsx src/lib/session.ts worker/index.ts worker/app.ts plans/README.md`.
> If any in-scope or recon-input file changed since this plan was written,
> compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: none (related to plan 017; keep delivery channels distinct)
- **Category**: direction
- **Planned at**: commit `dcbfe34`, 2026-06-17

## Why this matters

When a user signs out of Passport, an admin bans them, or a session is revoked,
the connected OAuth/OIDC relying parties (RPs) keep their own live sessions until
the access/ID token naturally expires. For an identity provider this is a real
security gap: a "sign out everywhere" or an emergency ban does not actually end
downstream sessions. The data model already hints the intent was anticipated —
`oauth_client.enableEndSession` is a stored, admin-managed, UI-surfaced flag
(`src/db/schema.ts:390`) — but there is **no** `logout_token` minting or
back-channel delivery anywhere (`grep -rniE "logout_token|back.?channel" src
worker` returns nothing). This plan designs how a Passport sign-out / revoke /
ban propagates to connected clients per the OIDC logout specs.

This is intentionally a design/spike plan. The first and largest unknown is what
`@better-auth/oauth-provider` already supports natively for OIDC Back-Channel
Logout, RP-Initiated Logout, or Front-Channel Logout. The executor must answer
that with recon **before** recommending a build, because the right design is
"configure the plugin" if the plugin already mints logout tokens, and a much
larger custom build if it does not.

## Current state

- `src/db/schema.ts:390` — `oauth_client` has
  `enableEndSession: boolean("enable_end_session")`. This flag is plumbed through
  the worker (`worker/index.ts` `enable_end_session` mapping, `worker/app.ts`
  validation around line 357) and the Applications UI, but nothing consumes it
  at logout time today.
- `src/db/schema.ts:42-64` — `session` table; `src/db/schema.ts:436` includes a
  `revoked: timestamp("revoked")` column. Session revocation already exists as a
  concept.
- `src/pages/Sessions.tsx` — user-facing session list with a "Sign out"
  (revoke) action (`src/pages/Sessions.tsx:38`).
- `src/lib/session.ts:20-21` — `signOut()` calls `authClient.signOut()`.
- `src/auth.ts` — Better Auth factory mounting `oauthProvider(...)`
  (`src/auth.ts:718-759`). Note `disabledPaths: ["/token"]` and the existing
  `enableEndSession` handling on `trustedClients`. The OAuth provider plugin is
  where any native logout-token capability would live.
- `worker/index.ts` adminUsers service (`ban`/`unban`) and the OAuth services are
  the operator-side triggers that should also fan out a logout.

No back-channel logout, `logout_token`, `sid` propagation, or front-channel
iframe logout exists. The `sid` claim *is* advertised in `claims_supported`
(`src/lib/oauth-scope-claims.ts:111`), which is a prerequisite for back-channel
logout — note whether it is actually emitted.

Repo conventions to match:

- pnpm only; bump `package.json` on change; Workers-only Web APIs; CLI-generated
  migrations only; file-level notes on new files (see `AGENTS.md`, `goal.md`).
- Follow library docs literally; never invent better-auth API names or import
  paths (`goal.md`). This is critical here — the design hinges on the real
  plugin surface.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Native logout-support recon (primary) | `rg -ni "logout|end.?session|back.?channel|front.?channel|logout_token|sid" node_modules/@better-auth/oauth-provider -g "*.d.ts" -g "*.js"` | determine exactly what the plugin supports |
| Better Auth core logout recon | `rg -ni "logout|revokeSession|sid|session_id" node_modules/better-auth -g "*.d.ts"` | find session-revocation + sid hooks |
| Confirm enableEndSession plumbing | `rg -n "enableEndSession|enable_end_session|endSession" src worker` | confirm the flag is stored/managed but not consumed at logout |
| Tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Typecheck | `pnpm exec tsc -b --noEmit` | exit 0 |
| Build | `pnpm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `package.json` (version bump)
- `README.md` (planned pointer only)
- `docs/back-channel-logout.md` (create)
- `plans/README.md` (status row)

**Recon-only inputs** (read, do NOT modify):

- `src/auth.ts`
- `src/db/schema.ts`
- `src/pages/Sessions.tsx`
- `src/lib/session.ts`
- `worker/index.ts`
- `worker/app.ts`
- `src/lib/oauth-scope-claims.ts`
- `node_modules/@better-auth/oauth-provider` and `node_modules/better-auth`

**Out of scope for this plan**:

- Implementing logout-token minting, delivery, or any session-propagation code.
- Schema migrations.
- Changing the `oauthProvider` configuration in `src/auth.ts`.
- Building the generic webhook layer (that is plan 017; logout tokens are
  OIDC-standard and must not be reshaped into custom webhook events).

## Git workflow

- Branch: `feature/back-channel-logout-design` (human-readable per `AGENTS.md`).
- Do NOT push or open a PR unless explicitly instructed.

## Design work to complete

Create `docs/back-channel-logout.md` answering every section below.

### 1. Problem statement and non-goals

State the gap concretely (downstream sessions survive Passport sign-out / ban /
revoke). Non-goals for the first implementation: no SLO front-channel iframe
logout if back-channel covers the need; no cross-device session-management
dashboard beyond existing Sessions page; no SAML SLO.

### 2. Native capability findings (do this first)

Document exactly what `@better-auth/oauth-provider` and `better-auth` provide
today, from the recon commands above:

- Is there an RP-Initiated Logout endpoint (e.g. `/oauth2/end-session` /
  `end_session_endpoint` in discovery)? Note what `disabledPaths: ["/token"]`
  and the existing config imply.
- Does the plugin mint OIDC `logout_token`s for Back-Channel Logout, and does it
  read `backchannel_logout_uri` from client registration?
- Is the `sid` (session id) claim actually emitted in ID tokens (it is
  *advertised* at `src/lib/oauth-scope-claims.ts:111`)? Back-channel logout
  needs either `sub`- or `sid`-scoped logout tokens.
- What does `enableEndSession` actually gate in the plugin?

State plainly: **"the plugin already does X; it does not do Y."** The rest of
the design branches on this.

### 3. Recommended approach

Based on section 2, recommend one of:

- **(A) Configure the plugin**: if it natively supports back-channel logout, the
  design is mostly registration fields (`backchannel_logout_uri`), enabling
  `sid`, wiring sign-out/ban/revoke to the plugin's logout trigger, and consent/
  client-management UI for the logout URI. Strongly prefer this.
- **(B) Custom logout-token layer**: only if the plugin cannot. Specify
  `logout_token` JWT minting (reuse the existing `jwt()` RS256 / JWKS setup —
  `src/auth.ts:694-701`), the spec-required claims (`iss`, `aud`, `iat`, `jti`,
  `events`, and `sub` and/or `sid`), and delivery to each affected client's
  `backchannel_logout_uri`.

Document why, and call out the risk that option B partially reimplements OIDC
logout — a STOP-worthy signal that the approach needs maintainer review.

### 4. Trigger points

Enumerate every Passport action that must propagate a logout, mapped to its
current code site:

- user self sign-out — `src/lib/session.ts` / Better Auth sign-out path.
- session revoke from `src/pages/Sessions.tsx`.
- admin ban — `worker/index.ts` adminUsers `ban`.
- admin revoke / forced sign-out, if applicable.
- account deletion.

For each, state which connected clients should receive a logout and how the set
of affected clients is determined (via the user's `oauth_consent` rows /
`oauthAccessToken` records).

### 5. Client registration fields

Define the registration/management additions: `backchannel_logout_uri`,
optionally `backchannel_logout_session_required`, and how they relate to the
existing `enableEndSession` and `postLogoutRedirectURLs` fields. Avoid adding a
redundant flag if `enableEndSession` already expresses intent — recommend reusing
or clearly superseding it.

### 6. Delivery and failure semantics

Specify timeout, retry policy, and what happens when a client's logout endpoint
is down (the user is still signed out at Passport; downstream cleanup is
best-effort). If durable retry is wanted, note it can reuse the delivery
mechanism chosen in plan 017 but must keep an OIDC-compliant `logout_token`
body, not a custom event envelope.

### 7. Discovery metadata

Document the `.well-known` changes implied: `end_session_endpoint`,
`backchannel_logout_supported`, `backchannel_logout_session_supported`. Note
whether the plugin emits these automatically.

### 8. Implementation phases after design

End with a phased breakdown, each with a verification and rollback note. The
shape depends on whether section 3 chose (A) or (B); write the phases for the
recommended option.

## README update

Add a short "planned" pointer to `docs/back-channel-logout.md`. Do NOT claim
back-channel logout ships.

## Version and status

- Bump the root `package.json` patch version.
- Update `plans/README.md` status for plan 018 when complete.

## Test plan

Design docs only; no new runtime tests in this plan. Verification is that the
baseline suite still passes after the doc/version edits (`pnpm test`). Each
implementation phase in section 8 carries its own test requirement (e.g. a
logout-token claim-shape test and a trigger-fan-out test) — do not write those
here.

## Done criteria

ALL must hold:

- [ ] `docs/back-channel-logout.md` exists and answers sections 1-8.
- [ ] Section 2 states concretely what `@better-auth/oauth-provider` does and
      does not support for logout, with evidence from the recon commands.
- [ ] Section 3 recommends approach (A) or (B) with justification.
- [ ] Section 4 maps every logout trigger to a current code location.
- [ ] README links to the design without implying the feature shipped.
- [ ] No runtime, schema, or `src/auth.ts` config changes were applied.
- [ ] `pnpm test`, `pnpm lint`, `pnpm exec tsc -b --noEmit`,
      `pnpm run build` all pass.
- [ ] Only In-scope files modified (`git status`).
- [ ] `plans/README.md` marks 018 as DONE.

## STOP conditions

Stop and report (do not improvise) if:

- Recon shows the plugin's logout model is fundamentally incompatible with the
  existing `enableEndSession`/`sid` setup, so the design would require replacing
  or forking the OAuth provider plugin.
- The recommended approach turns out to be option (B) (custom logout tokens) AND
  it would require changing token-issuance semantics — flag for maintainer
  review before finalizing.
- Prototyping section 2 requires editing `src/auth.ts` runtime config to even
  observe behavior — that is implementation, out of scope.
- Recon-input files have drifted past the "Current state" excerpts.

## Maintenance notes

- The single largest risk is reimplementing OIDC logout by hand. If the plugin
  supports it, the build should be small. Keep section 2's findings precise so a
  future executor does not re-spike.
- Keep `logout_token` delivery OIDC-compliant even if it reuses plan 017's
  delivery transport. A reviewer should verify the token body matches the OIDC
  Back-Channel Logout spec (`events` claim, `sub`/`sid`, `jti`).
- Confirm `sid` is actually emitted before relying on `sid`-based logout; if only
  `sub`-based logout is feasible, document the implication (all of a user's
  sessions at a client are ended together).
