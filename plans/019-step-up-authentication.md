# Plan 019: Design step-up authentication and auth-context enforcement

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- package.json README.md docs src/auth.ts src/lib/oauth-scope-claims.ts src/pages/SignIn.tsx src/pages/Consent.tsx plans/README.md`
> and `git diff --stat -- package.json README.md docs src/auth.ts src/lib/oauth-scope-claims.ts src/pages/SignIn.tsx src/pages/Consent.tsx plans/README.md`.
> If any in-scope or recon-input file changed since this plan was written,
> compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M-L
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `dcbfe34`, 2026-06-17

## Why this matters

Passport already *describes* the strength of an authentication to relying
parties — `mfa_enabled` and `passkey_enabled` claims are computed
(`src/lib/oauth-scope-claims.ts:233-234`), and `acr` and `auth_time` are
advertised in `claims_supported` (`src/lib/oauth-scope-claims.ts:122-123`). But
there is **no** way for an RP to *require* a stronger authentication: grep for
`prompt`, `max_age`, `reauth`, and `step-up` across `src/` and `worker/` returns
nothing, and `acr`/`auth_time` are advertised yet never actually built in any
claim builder. So a sensitive client (admin console, payment flow) can read that
a session was *not* MFA-backed but cannot ask Passport to force MFA or a fresh
login. This plan designs the missing write/require side: honoring the OIDC
`prompt=login` and `max_age` parameters, emitting truthful `acr`/`amr`/
`auth_time`, and optionally letting a client require MFA.

This is a design/spike plan. The pivotal unknown is how much of `prompt`,
`max_age`, and `acr` handling `@better-auth/oauth-provider` and the `twoFactor`
plugin already implement, versus what Passport must add at the `/sign-in` and
authorize boundary. Recon answers that before any build is recommended.

## Current state

- `src/lib/oauth-scope-claims.ts:105-136` — `oauthClaimsSupported` advertises
  `auth_time` and `acr` plus namespaced `mfa_enabled`/`passkey_enabled` claim
  URLs:

  ```ts
  // src/lib/oauth-scope-claims.ts:121-133 (excerpt)
  "preferred_username",
  "auth_time",
  "acr",
  // ... namespaced claim URLs ...
  oauthClaimURL(env, "mfa_enabled"),
  oauthClaimURL(env, "passkey_enabled"),
  ```

- `src/lib/oauth-scope-claims.ts:224-236` — `accountSecurityClaims` builds
  `mfa_enabled` and `passkey_enabled` only under the `account:security` scope.
  **`acr` and `auth_time` are advertised but never built** in
  `buildIDTokenScopeClaims`, `buildUserInfoScopeClaims`, or
  `buildAccessTokenScopeClaims`.
- `src/auth.ts:645-668` — `twoFactor(...)` plugin config (TOTP, OTP, backup
  codes, `twoFactorCookieMaxAge`, `trustDeviceMaxAge`); `src/auth.ts:702-705`
  `passkey(...)`. These are the authenticators a step-up would invoke.
- `src/auth.ts:718-759` — `oauthProvider(...)` with `loginPage: "/sign-in"` and
  `consentPage: "/consent"`, plus `customIdTokenClaims`/`customAccessTokenClaims`/
  `customUserInfoClaims` hooks that already inject Passport's scope claims. These
  hooks are where `acr`/`amr`/`auth_time` would be emitted.
- `src/pages/SignIn.tsx` — the login page the authorize flow redirects to. Any
  `prompt=login`/`max_age` forcing of re-auth surfaces here.

There is no enforcement of `prompt`, `max_age`, per-scope MFA, or any `acr`
contract. The claim surface is read-only.

Repo conventions to match: pnpm only; bump `package.json`; Workers-only Web
APIs; CLI-generated migrations; follow better-auth docs literally and never
invent API names (`goal.md`); file-level notes on new files (`AGENTS.md`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Provider prompt/max_age recon | `rg -ni "prompt|max_age|acr|amr|auth_time|requireMfa|step.?up" node_modules/@better-auth/oauth-provider -g "*.d.ts" -g "*.js"` | determine what the plugin already enforces |
| twoFactor / session freshness recon | `rg -ni "twoFactor|trustDevice|auth.?time|freshness|reverify" node_modules/better-auth -g "*.d.ts"` | find MFA + session-age primitives to reuse |
| Confirm claims gap | `rg -n "acr|auth_time|amr" src/lib/oauth-scope-claims.ts` | confirm acr/auth_time advertised but not built |
| Tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Typecheck | `pnpm exec tsc -b --noEmit` | exit 0 |
| Build | `pnpm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `package.json` (version bump)
- `README.md` (planned pointer only)
- `docs/step-up-authentication.md` (create)
- `plans/README.md` (status row)

**Recon-only inputs** (read, do NOT modify):

- `src/lib/oauth-scope-claims.ts`
- `src/auth.ts`
- `src/pages/SignIn.tsx`
- `src/pages/Consent.tsx`
- `node_modules/@better-auth/oauth-provider` and `node_modules/better-auth`

**Out of scope for this plan**:

- Implementing `acr`/`amr`/`auth_time` emission or `prompt`/`max_age` handling.
- Changing the `oauthProvider` or `twoFactor` config in `src/auth.ts`.
- UI changes to `SignIn.tsx`/`Consent.tsx`.
- Schema migrations.

## Git workflow

- Branch: `feature/step-up-auth-design` (human-readable per `AGENTS.md`).
- Do NOT push or open a PR unless explicitly instructed.

## Design work to complete

Create `docs/step-up-authentication.md` answering every section below.

### 1. Problem statement and non-goals

State the asymmetry: Passport reports auth strength but cannot be told to
increase it. Non-goals: no risk-based/adaptive auth engine; no device
fingerprinting beyond existing session metadata; no new authenticator types
(reuse TOTP/OTP/passkey already configured).

### 2. Native capability findings (do first)

From recon, document exactly what `@better-auth/oauth-provider` does with the
OIDC `prompt` (`none`, `login`, `consent`) and `max_age` authorize parameters,
and whether better-auth exposes session `auth_time`/freshness and a way to force
re-verification or MFA. State plainly what exists vs what Passport must add.

### 3. `acr` / `amr` / `auth_time` claim contract

Define the authentication-context claims Passport will emit (closing the
advertised-but-unbuilt gap):

- `auth_time`: the timestamp of the authentication event for the session.
- `amr`: the methods used (e.g. `pwd`, `otp`, `mfa`, `swk` for passkey) — derive
  from the actual sign-in path and `lastLoginMethod`/2FA state.
- `acr`: an ordered context contract. Recommend a small, documented set (e.g.
  `urn:passport:1fa`, `urn:passport:mfa`) rather than inventing per-client
  values. Specify where these are built — the `customIdTokenClaims` hook in
  `src/auth.ts` calling a new builder in `oauth-scope-claims.ts`.

State that emitting these must be truthful (no claiming MFA when a session was
single-factor) and gated appropriately.

### 4. Enforcement: prompt and max_age

Define how an authorize request with `prompt=login` or a `max_age` shorter than
the session age forces re-authentication at `/sign-in`, and how `prompt=none`
returns the correct OIDC error when interaction would be required. Map this to
whether the plugin handles it (configure) or Passport must intercept at the
authorize boundary (build).

### 5. Per-client MFA requirement (optional tier)

Decide whether a registered client may require MFA-backed sessions (e.g. a
`require_mfa` registration field or an `acr_values` request). Recommend the
OIDC-standard `acr_values`/`claims` request mechanism over a custom flag if the
plugin supports it; otherwise sketch a minimal client field. Keep this a
second-phase tier so the `acr` contract can ship first.

### 6. Step-up UX

Describe what the user sees when step-up is triggered mid-session: a focused
re-auth / MFA prompt at `/sign-in` that returns to the authorize flow, not a full
logout. Note interaction with `twoFactorCookieMaxAge` and `trustDeviceMaxAge`
(`src/auth.ts:666-667`).

### 7. Discovery metadata

Document `acr_values_supported` and any `prompt`/`claims` advertisement to add to
the OIDC discovery document, and whether the plugin emits them automatically.

### 8. Implementation phases after design

End with a phased breakdown (each with verification + rollback notes):

1. emit truthful `auth_time`/`amr`/`acr` claims (read side completed)
2. honor `prompt=login` / `max_age` at authorize
3. optional per-client MFA requirement
4. discovery metadata + docs

## README update

Short "planned" pointer to `docs/step-up-authentication.md`. Do NOT claim
step-up ships.

## Version and status

- Bump root `package.json` patch version.
- Update `plans/README.md` status for plan 019 when complete.

## Test plan

Design docs only; no new runtime tests here. Verification is the baseline suite
passing after doc/version edits (`pnpm test`). Phase 1 of section 8 will need a
claim-shape unit test modeled on the existing `src/lib/oauth-scope-claims.test.ts`
— do not write it in this plan.

## Done criteria

ALL must hold:

- [ ] `docs/step-up-authentication.md` exists and answers sections 1-8.
- [ ] Section 2 states concretely what the plugin enforces for `prompt`/
      `max_age` and what better-auth offers for session freshness/MFA, with
      recon evidence.
- [ ] Section 3 defines a concrete, documented `acr`/`amr`/`auth_time` contract
      and names the exact build site (`customIdTokenClaims` →
      `oauth-scope-claims.ts`).
- [ ] README links to the design without implying step-up shipped.
- [ ] No runtime, config, schema, or UI changes were applied.
- [ ] `pnpm test`, `pnpm lint`, `pnpm exec tsc -b --noEmit`,
      `pnpm run build` all pass.
- [ ] Only In-scope files modified (`git status`).
- [ ] `plans/README.md` marks 019 as DONE.

## STOP conditions

Stop and report (do not improvise) if:

- Recon shows the plugin enforces `prompt`/`max_age` in a way that conflicts with
  emitting custom `acr`/`amr` claims, so the design would fight the plugin.
- The `acr` contract cannot be made truthful without restructuring how sessions
  record their authentication method — flag for maintainer review.
- Prototyping requires editing `src/auth.ts` runtime config — out of scope.
- Recon-input files drifted past the "Current state" excerpts (especially if
  `acr`/`auth_time` are now actually built in `oauth-scope-claims.ts`).

## Maintenance notes

- Emit only truthful auth-context claims; a reviewer must confirm `amr`/`acr`
  reflect the real sign-in, not a constant. This is a security claim downstream
  apps will trust for access decisions.
- Phase 1 (claims) is independently shippable and low-risk; the enforcement
  phases are where the plugin-vs-custom decision bites. Keep them separable.
- This pairs conceptually with the `account:security` scope already shipped;
  do not duplicate its `mfa_enabled`/`passkey_enabled` claims — `acr`/`amr` are
  the standard, interoperable expression of the same facts.
