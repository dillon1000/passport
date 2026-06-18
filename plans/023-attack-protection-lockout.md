# Plan 023: Attack protection — rate limiting, account lockout, risk-based step-up

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- src/lib/auth-server/config.ts src/lib/auth-server/options.ts src/lib/auth-server/hooks.ts src/lib/account-activity.ts src/lib/kv-secondary-storage.ts .dev.vars.example src/env.ts README.md plans/README.md`
> and the same with no commit range for the working tree. If any in-scope or
> recon-input file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.
>
> **Recon gate (run before writing any code)**: confirm at the installed
> `better-auth@1.6.18` what the core `rateLimit` option supports (`window`,
> `max`, `storage`, `customRules`, and whether `secondaryStorage` is used as the
> limiter store) and whether any native failed-login lockout exists. Build on the
> framework's primitive where one exists; only add bespoke logic for the gap.

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MED (a too-aggressive limiter or lockout can deny legitimate users —
  thresholds must be conservative and configurable)
- **Depends on**: none (Phase 3 step-up builds on plan 019's `acr`/`amr` work and the
  existing `twoFactor` plugin)
- **Category**: direction (Passport owns the credentials, so credential-abuse defense
  is non-negotiable)
- **Planned at**: commit `dcbfe34`, 2026-06-18
- **Explicitly excluded**: breached-password detection (HIBP / "Have I Been Pwned"
  k-anonymity). It depends on a paid/external service and is out of scope by operator
  decision. Do not add any external password-reputation lookup in this plan.

## Why this matters

Once an organization runs Passport as its own IdP, Passport holds the passwords. That
makes it the target for the two highest-volume credential attacks: **brute force**
(many guesses against one account) and **credential stuffing** (one guess each against
many accounts, usually from rotating IPs). Today the only protections are optional
CAPTCHA (`src/lib/auth-server/plugins.ts:79-130`, off unless `CAPTCHA_SECRET_KEY` is
set) and a notification when a sign-in comes from a new IP
(`maybeSendNewIPAddressNotification`, `src/lib/auth-server/hooks.ts:113-135`). There is
**no rate limiting configured** and **no account lockout**. That is the floor, not the
ceiling, and it is the first thing an organization's security review will flag.

This plan adds three layers, smallest-blast-radius first:

1. **Rate limiting** on auth-sensitive endpoints, using Better Auth's built-in
   `rateLimit` backed by the KV secondary storage the repo already configures.
2. **Account-level lockout** keyed by identity (not just IP), because credential
   stuffing rotates IPs to evade IP-based limits — with a cooldown, a security-alert
   email, and an account-activity log entry reusing the plan-020 taxonomy.
3. **Optional risk-based step-up** that requires a second factor / re-auth when a
   sign-in looks risky (new IP, lockout recovery), reusing the existing `twoFactor`
   plugin and plan 019's `acr`/`amr` story.

## Current state

- `src/lib/auth-server/config.ts` — assembles the full options object. It sets
  `secondaryStorage: createKVSecondaryStorage(env.AUTH_SECONDARY_STORAGE)` (`:36`) and
  `emailAndPassword` with `requireEmailVerification` (`:42-57`), but does **not** set a
  top-level `rateLimit` option. `grep -rin "rateLimit" src worker` returns nothing.
- `src/lib/auth-server/options.ts` — `AUTH_ADVANCED_OPTIONS` configures `cookiePrefix`,
  the session cookie name, and `ipAddress.ipAddressHeaders`
  (`["cf-connecting-ip", "x-forwarded-for"]`). This is the trusted source of client IP
  and what any limiter/lockout must key on.
- `src/lib/auth-server/hooks.ts` — `accountSecurityEmailPlugin(env, db)` (`:167-214`)
  registers an `after` middleware on **every** auth path (`matcher: () => true`). It
  already: early-returns on `isAPIError(ctx.context.returned)` (`:175`), records
  account-activity rows (`recordAccountActivity`, `:144-165`), sends security-alert
  emails respecting per-user prefs (`sendSecurityNotification`, `:95-111`), and detects
  new-IP sign-ins (`isNewSignInIPAddress`, `:70-82`). This is the natural insertion
  point for failed-attempt counting and lockout signaling.
- `src/lib/account-activity.ts` — single source of truth for activity types + label
  copy (used by both the user feed and security emails). A lockout event type/label
  must be added here, not invented inline (per the plan-020 maintenance note in
  `plans/README.md`).
- `src/lib/kv-secondary-storage.ts` — the KV-backed secondary storage already wired
  into the auth instance; the obvious store for short-lived failed-attempt counters
  with TTL.
- CAPTCHA plugin (`src/lib/auth-server/plugins.ts:79-130`) guards a fixed set of
  endpoints (`CAPTCHA_ENDPOINTS`) and is opt-in. Rate limiting and lockout are
  complementary defenses, not replacements.
- `twoFactor` plugin (`src/lib/auth-server/plugins.ts:230-253`) is configured (TOTP +
  OTP + backup codes + trusted-device), so a step-up challenge mechanism already
  exists to build Phase 3 on.
- `.dev.vars.example` — documents CAPTCHA and admin keys with one-line comments; no
  rate-limit/lockout config keys yet.

Repo conventions to match (`AGENTS.md`, `goal.md`, `README.md`): pnpm only; version
bump on every change; Workers-only Web APIs (KV/`crypto.subtle`, no Node built-ins);
generated migrations only; no `any`; file-level header comments; avoid feature creep;
secrets only in `.dev.vars`, with `.dev.vars.example` as the shareable template.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Confirm core rateLimit option shape | `rg -n "rateLimit\|customRules\|window\|storage" node_modules/better-auth/dist/**/*.d.mts` | option with `window`/`max`/`storage`/`customRules` |
| Check for native lockout | `rg -ni "lockout\|failed.?attempt\|maxAttempts\|lock" node_modules/better-auth/dist/**/*.d.mts` | determine if a native primitive exists |
| Confirm no current rate limiting | `rg -n "rateLimit" src worker` | no matches (greenfield) |
| Confirm IP header source | `rg -n "ipAddressHeaders\|requestIPAddress" src` | `options.ts` + `request-metadata` |
| Local run | `pnpm dev` | provider boots |
| Tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm run build` | exit 0 |

## Scope

**In scope** (the files you may modify):

- `src/lib/auth-server/config.ts` — add and configure the top-level `rateLimit` option
  (backed by the existing KV secondary storage), with `customRules` for auth-sensitive
  paths.
- `src/lib/auth-server/options.ts` — if rate-limit constants belong with the other
  shared static options, place them here for testability.
- `src/lib/auth-server/hooks.ts` — failed-attempt counting + lockout enforcement,
  layered into the existing `accountSecurityEmailPlugin` middleware (or a sibling hook
  in the same file), plus the lockout security email + activity record.
- `src/lib/account-lockout.ts` (create) — the lockout policy: key derivation
  (normalized identifier), thresholds, cooldown, KV counter read/increment/clear, and
  a pure `isLockedOut` helper that is unit-testable without KV.
- `src/lib/account-activity.ts` — add the lockout activity type + label.
- `src/env.ts`, `.dev.vars.example` — config keys for thresholds/windows with one-line
  comments and safe defaults.
- `README.md` — document the attack-protection configuration.
- Test files alongside the existing `src/lib/*.test.ts` and worker tests.
- `package.json` (version bump), `plans/README.md` (status).

**Recon-only inputs** (read to ground the work; do NOT modify):

- `node_modules/better-auth` types at 1.6.18 (`rateLimit`, any lockout primitive).
- `src/lib/kv-secondary-storage.ts`, `src/lib/request-metadata.ts`,
  `src/lib/auth-server/plugins.ts` (CAPTCHA + twoFactor), `src/lib/oauth-error` style.

**Out of scope for this plan** (do NOT do these here):

- HIBP / breached-password detection or any external password-reputation lookup
  (operator-excluded).
- Bot-management / device-fingerprinting beyond the existing CAPTCHA plugin.
- A full anomaly-detection engine or ML risk scoring. Phase 3 risk is a small set of
  explicit signals (new IP, recent lockout), not a model.
- Admin UI for tuning thresholds — configuration is via env keys in this pass
  (matching CAPTCHA/admin conventions). A UI can come later if demanded.
- IP allow/deny lists and geo-blocking.

## Git workflow

- Branch: `feature/attack-protection` (human-readable; no `claude/*`).
- Do NOT push or open a PR unless the operator explicitly instructs it.

## Implementation steps

### 1. Recon and rate-limit configuration (Phase 1)

Confirm the `rateLimit` option shape at 1.6.18 and whether it can use the configured
`secondaryStorage` (KV) as its store — important because a Worker has no shared
in-memory state across isolates, so an in-memory limiter is ineffective. Then in
`src/lib/auth-server/config.ts`:

- Enable `rateLimit` with conservative global defaults and `customRules` tightening
  the sensitive paths: `/sign-in/email`, `/sign-up/email`, `/two-factor/*` verify,
  `/forget-password` / `/reset-password`, `/phone-number/*` and OTP send/verify, and
  the magic-link request path.
- Back it with KV so limits hold across isolates.
- Make the limits configurable via env with safe defaults so an operator can tune
  without a redeploy of code.

Verify with `pnpm dev`: rapid repeated requests to a guarded path eventually return
the framework's rate-limit response (e.g. 429); a normal cadence is unaffected.

### 2. Account lockout (Phase 2)

IP rate limiting does not stop credential stuffing (rotating IPs, one try per account).
Add identity-keyed lockout in `src/lib/account-lockout.ts`:

- Key on the **normalized identifier** (email/username/phone) the request targets — not
  the IP. Reuse the same normalization used elsewhere (lower-cased/trimmed, mirroring
  `normalizeIPAddress` style in `hooks.ts:65-68`).
- On a **failed** credential sign-in (detected in the `after` middleware via
  `isAPIError(ctx.context.returned)` on the sign-in path), increment a KV counter with
  a sliding TTL window.
- When the count crosses the threshold, mark the identifier locked for a cooldown
  period. While locked, sign-in attempts are rejected with a generic message that does
  **not** reveal whether the account exists (avoid user enumeration).
- On a **successful** sign-in, clear the counter.
- On lockout, send a security-alert email (`sendSecurityNotification`) and record an
  account-activity row using a new `ACCOUNT_LOCKED`-style type added to
  `src/lib/account-activity.ts`.
- Keep `isLockedOut(count, lockedUntil, now)` and the key-derivation function pure and
  unit-tested without KV.

Threshold/window/cooldown are env-configurable with conservative defaults. Document
the interaction with CAPTCHA (lockout complements it; if CAPTCHA is enabled it raises
the cost of reaching the threshold).

### 3. Risk-based step-up (Phase 3 — optional, behind config)

Reuse existing pieces rather than inventing scoring:

- Risk signals: sign-in from a new IP (`isNewSignInIPAddress`, already computed) and/or
  sign-in shortly after a lockout cleared.
- When a risk signal fires and the user has a second factor enrolled, require a
  step-up challenge via the existing `twoFactor` plugin before completing the session;
  reflect the satisfied factor in `acr`/`amr` (plan 019 already mints these in
  `src/lib/oauth-scope-claims.ts`).
- Gate the whole phase behind a config flag, default off, so operators opt in. If
  wiring step-up cleanly requires changing core sign-in flow semantics beyond a hook,
  STOP and treat Phase 3 as a separate plan rather than forcing it here.

### 4. Configuration, docs, and defaults

- Add the env keys (rate-limit window/max, lockout threshold/window/cooldown, the
  Phase-3 flag) to `src/env.ts` parsing and `.dev.vars.example` with one-line comments
  and safe defaults; ensure everything degrades gracefully when unset (limits use
  defaults; lockout on by default with conservative numbers; step-up off by default).
- Update `README.md`'s runtime-configuration section to document attack protection
  alongside the existing CAPTCHA docs.

## Test plan

- Unit: `isLockedOut` and key derivation across boundaries (below threshold, at
  threshold, within/after cooldown, identifier normalization), with no KV dependency.
- Unit: env parsing of the new keys (defaults applied when unset; invalid values
  rejected with a clear error, mirroring existing `parseOptionalNumber` usage).
- Route/integration: a guarded path is rate-limited after N rapid requests; a locked
  identifier is rejected with a non-enumerating message; a successful sign-in clears
  the counter. Mock KV per the `testing` skill.
- Confirm lockout emits exactly one activity row + at most one alert email per lockout
  event (no per-attempt spam).
- Baseline: `pnpm test`, `pnpm lint`, `pnpm run build` all green.

## Done criteria

ALL must hold:

- [ ] Auth-sensitive endpoints are rate-limited via Better Auth's `rateLimit`, backed
      by KV so limits hold across Worker isolates; limits are env-configurable.
- [ ] Repeated failed credential sign-ins for one identifier trigger a temporary
      lockout with a cooldown, keyed on identity (not IP), with non-enumerating error
      copy.
- [ ] A successful sign-in clears the failed-attempt counter.
- [ ] Lockout produces one security-alert email (respecting user prefs) and one
      account-activity row using a taxonomy entry in `src/lib/account-activity.ts`.
- [ ] Phase 3 step-up, if implemented, is behind a default-off config flag and reuses
      the `twoFactor` plugin + plan-019 `acr`/`amr`; otherwise it is cleanly deferred
      with a note.
- [ ] No external/paid breached-password service was added.
- [ ] New config keys are in `.dev.vars.example` with comments and safe defaults;
      README documents them.
- [ ] `pnpm test`, `pnpm lint`, `pnpm run build` pass; root `package.json` version
      bumped; `plans/README.md` marks 023 DONE.

## STOP conditions

Stop and report (do not improvise) if:

- The core `rateLimit` option cannot use a shared (KV) store at the installed version —
  an in-memory limiter is ineffective across Worker isolates and must not be shipped as
  if it works.
- Implementing failed-attempt detection requires changing core sign-in semantics beyond
  reading `ctx.context.returned` / `isAPIError` in a hook — surface the need before
  modifying the credential flow.
- Lockout cannot be made non-enumerating (i.e. the only available error reveals whether
  an account exists) — solve enumeration before shipping lockout.
- Phase 3 step-up would require forking the sign-in flow — defer it as its own plan.

## Maintenance notes

- Thresholds must stay conservative and operator-tunable: a lockout that is too
  aggressive becomes a self-inflicted denial of service. Defaults should err toward
  alerting + modest cooldown rather than long hard locks.
- Lockout and CAPTCHA are layers, not alternatives. Document that enabling CAPTCHA
  raises the cost of reaching the lockout threshold; neither replaces the other.
- Breached-password detection is intentionally excluded; if the operator later accepts
  an external dependency, the k-anonymity HIBP range API is the standard privacy-safe
  approach and would slot in at registration/password-change, parallel to this plan —
  not inside it.
- Keep the lockout activity `type` string identical wherever it surfaces (user feed,
  security email, any future webhook), per the plan-017/020 cross-naming note.
