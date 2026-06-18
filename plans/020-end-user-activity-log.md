# Plan 020: Design the end-user account activity log

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- package.json README.md docs src/auth.ts src/db/schema.ts src/pages/Security.tsx src/pages/Sessions.tsx worker/index.ts worker/app.ts plans/README.md`
> and `git diff --stat -- package.json README.md docs src/auth.ts src/db/schema.ts src/pages/Security.tsx src/pages/Sessions.tsx worker/index.ts worker/app.ts plans/README.md`.
> If any in-scope or recon-input file changed since this plan was written,
> compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `dcbfe34`, 2026-06-17

## Why this matters

Passport already has an operator-facing audit trail — `adminAuditEvent`
persists privileged mutations (`src/db/schema.ts:494-522`, surfaced in
`AdminAudit.tsx`) — and it already enumerates the *end user's* own security
events to drive alert emails (`securityEventForPath` in `src/auth.ts:409-423`:
password changed, email changed, passkey added/removed, 2FA enabled/disabled,
account linked/unlinked, new-IP sign-in, etc.). But the end user has no in-app
history: the [Sessions page](src/pages/Sessions.tsx) shows only currently active
sessions, and nothing records "you changed your password on June 3" or "a new
device signed in." A user-visible account activity log is a baseline security
expectation, and almost all of the event taxonomy already exists in the email
path — this is mostly persisting and surfacing what Passport already detects.

This plan is a design plan with a clear first build phase. It defines the event
model, where events are recorded, retention, and the UI surface, so the eventual
implementation reuses the existing `adminAuditEvent` conventions rather than
inventing a parallel pattern.

## Current state

- `src/auth.ts:409-423` — `securityEventForPath` maps auth API paths to
  human-readable security events (the de-facto user-event taxonomy):

  ```ts
  // src/auth.ts:409-423 (excerpt)
  if (path === "/change-email") return "Email change requested";
  if (path === "/change-password") return "Password changed";
  if (path === "/set-password") return "Password set";
  if (path === "/unlink-account") return "Social account unlinked";
  if (path === "/passkey/verify-registration") return "Passkey added";
  if (path === "/passkey/delete-passkey") return "Passkey removed";
  if (path === "/phone-number/verify") return "Phone number added";
  if (path === "/two-factor/enable") return "Two-factor authentication setup started";
  // ... etc
  ```

- `src/auth.ts:425-456` — `accountSecurityEmailPlugin`: an `after` middleware
  already runs on every auth path, classifies the event, and (for opted-in
  users) sends an alert email via `sendSecurityNotification`. This is the exact
  hook site where an activity-log row would also be written.
- `src/auth.ts:385-407` — `maybeSendNewIPAddressNotification` already detects
  new-IP sign-ins using session IP history.
- `src/db/schema.ts:494-522` — `adminAuditEvent`, the structural exemplar for a
  new per-user event table (text id, `defaultNow()` timestamp, indexed columns,
  `ipAddress`, jsonb `location`, `userAgent`, text `metadata`).
- `src/db/schema.ts:524-535` — `emailNotificationPreference` shows the
  user-scoped table convention (PK = `userId`, `onDelete: "cascade"`).
- `worker/index.ts` — the `adminAudit` service shows the record + paginated-list
  pattern (`list`/`record`) to mirror for a user-facing list service.
- `src/pages/Security.tsx` / `src/pages/Sessions.tsx` — the account security UI
  where an activity feed would live.

No per-user activity/event table exists today; the security events are detected
and emailed but never persisted for the user to review.

Repo conventions to match: pnpm only; bump `package.json`; Workers-only Web
APIs; **CLI-generated migrations only** (Better Auth CLI generate +
`pnpm db:generate` — never hand-write SQL, per `goal.md`/`README.md`);
file-level notes on new files; obvious-over-clever (`AGENTS.md`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Confirm event taxonomy source | `rg -n "securityEventForPath|accountSecurityEmailPlugin|sendSecurityNotification" src/auth.ts` | confirm the existing hook + taxonomy |
| Audit-table pattern recon | `rg -n "adminAuditEvent|mapAuditEvent|adminAudit" src worker` | confirm the record/list pattern to mirror |
| Tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Typecheck | `pnpm exec tsc -b --noEmit` | exit 0 |
| Build | `pnpm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):

- `package.json` (version bump)
- `README.md` (planned pointer only)
- `docs/end-user-activity-log.md` (create)
- `plans/README.md` (status row)

**Recon-only inputs** (read, do NOT modify):

- `src/auth.ts`
- `src/db/schema.ts`
- `worker/index.ts`
- `worker/app.ts`
- `src/pages/Security.tsx`
- `src/pages/Sessions.tsx`

**Out of scope for this plan**:

- Creating the activity table or running migrations.
- Implementing the record hook or the list service/route.
- UI implementation.
- Reusing the operator `adminAuditEvent` table for user events (the two
  audiences and retention/visibility models differ — design a separate table).

## Git workflow

- Branch: `feature/activity-log-design` (human-readable per `AGENTS.md`).
- Do NOT push or open a PR unless explicitly instructed.

## Design work to complete

Create `docs/end-user-activity-log.md` answering every section below.

### 1. Problem statement and non-goals

State it: users can't review their own account/security history; events are
detected and emailed but never persisted for review. Non-goals: no SIEM export;
no operator/admin reuse (that is `adminAuditEvent`); no analytics; no real-time
streaming.

### 2. Event taxonomy

Enumerate the user-visible events, grounded in `securityEventForPath` and the
new-IP/account-link detection in `src/auth.ts`. Group them (sign-in activity,
credential changes, MFA changes, connected accounts, profile changes) and define
a stable `type` string per event. State explicitly that **no secrets, OTP codes,
tokens, or passwords are ever stored** — only the event type, timestamp, and
request metadata already captured for emails (IP, location, user agent).

### 3. Recording architecture

Recommend writing the activity row from the **existing**
`accountSecurityEmailPlugin` after-hook (`src/auth.ts:425-456`), where the event
is already classified — decoupled from whether the user opted into emails (the
log records regardless; emails remain preference-gated). Specify that sign-in
events should be recorded even for users who disabled `securityAlerts`. Note this
hook currently lives in `src/auth.ts`; recording may instead live in a small
service in `worker/`/`src/lib/` invoked from the hook — recommend the obvious
placement and justify it.

### 4. Schema sketch

Sketch (do not create) an `account_activity_event` table mirroring
`adminAuditEvent` conventions: text id, `userId` FK with `onDelete: "cascade"`,
`createdAt` (`defaultNow()`), `type`, optional `targetLabel`, `ipAddress`, jsonb
`location`, `userAgent`, text `metadata`. Index by `(userId, createdAt)`.
Describe migration as a CLI generation step, never hand-written SQL.

### 5. Retention

Define a retention policy (e.g. rolling 90/180 days) and how old rows are
pruned (a scheduled sweep vs delete-on-read). Recommend the simplest durable
option.

### 6. List API and UI

Specify a paginated, user-scoped list service mirroring the `adminAudit.list`
shape in `worker/index.ts` (cursor/offset pagination already used there), the
route, and where the feed renders (a section in `src/pages/Security.tsx` or a
new tab). Keep the first pass read-only.

### 7. Privacy and access

State that a user sees only their own events; no cross-user access; operators use
the separate `adminAuditEvent` trail. Confirm cascade delete on account deletion
and that the activity log is included or excluded from the data-export ZIP
(`worker/data-export.ts`) — recommend including it.

### 8. Implementation phases after design

End with a phased breakdown (each with verification + rollback notes):

1. schema + recording hook (events persisted; no UI)
2. list service + route + tests
3. Security page activity feed UI
4. retention sweep + data-export inclusion + docs

## README update

Short "planned" pointer to `docs/end-user-activity-log.md`. Do NOT claim the
activity log ships.

## Version and status

- Bump root `package.json` patch version.
- Update `plans/README.md` status for plan 020 when complete.

## Test plan

Design docs only; no new runtime tests here. Verification is the baseline suite
passing after doc/version edits (`pnpm test`). Phase 2 of section 8 will need a
list-service test modeled on the existing admin-audit tests (see
`src/lib/admin-audit.test.ts`) — do not write it in this plan.

## Done criteria

ALL must hold:

- [ ] `docs/end-user-activity-log.md` exists and answers sections 1-8.
- [ ] Section 2's taxonomy maps each event to its detection site in
      `src/auth.ts` (`securityEventForPath` / new-IP / account-link).
- [ ] Section 4 sketches a separate user-scoped table, not reuse of
      `adminAuditEvent`.
- [ ] README links to the design without implying the feature shipped.
- [ ] No schema, hook, route, or UI changes were applied.
- [ ] `pnpm test`, `pnpm lint`, `pnpm exec tsc -b --noEmit`,
      `pnpm run build` all pass.
- [ ] Only In-scope files modified (`git status`).
- [ ] `plans/README.md` marks 020 as DONE.

## STOP conditions

Stop and report (do not improvise) if:

- Designing the recording path would require restructuring
  `accountSecurityEmailPlugin` rather than adding a write alongside the existing
  email call — flag it; the point is to reuse the existing classification.
- The event taxonomy cannot be made privacy-safe without storing sensitive data
  (it should not be — re-read section 2 before proceeding).
- Recon-input files drifted past the "Current state" excerpts.

## Maintenance notes

- Keep this table separate from `adminAuditEvent`. They have different audiences
  (user vs operator), retention, and access rules; merging them couples two
  products.
- A reviewer should confirm no secret/OTP/token material can land in `metadata`,
  and that sign-in events are logged independent of the `securityAlerts` email
  preference.
- When plan 017 (webhooks) lands, several of these same events become webhook
  sources; keep the taxonomy `type` strings consistent so the two surfaces
  describe the same event with the same name.
