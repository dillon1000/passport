# Plan 013: Add admin/operator audit timeline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- package.json src/db/schema.ts drizzle src/auth.ts src/auth-client.ts src/pages/AdminUsers.tsx src/pages/AdminAudit.tsx src/routes.tsx src/routes.test.tsx src/lib/nav.ts worker/app.ts worker/index.ts worker/app.test.ts src/lib/admin-audit.ts src/lib/admin-audit.test.ts plans/README.md`
> and `git diff --stat -- package.json src/db/schema.ts drizzle src/auth.ts src/auth-client.ts src/pages/AdminUsers.tsx src/pages/AdminAudit.tsx src/routes.tsx src/routes.test.tsx src/lib/nav.ts worker/app.ts worker/index.ts worker/app.test.ts src/lib/admin-audit.ts src/lib/admin-audit.test.ts plans/README.md`.
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: 006
- **Category**: direction
- **Planned at**: commit `dcbfe34`, 2026-06-16

## Why this matters

Passport now has real operator surfaces: admins can change user roles, ban and
unban users, register OAuth clients, rotate secrets, disable clients, and revoke
authorizations. Those actions affect who can authenticate, what apps can access,
and whether client credentials remain valid. Without a server-side audit trail,
operators cannot answer the basic incident questions: who changed this, when,
from where, and what target was affected?

This plan adds a minimal, durable audit timeline for privileged actions. The
important boundary is server-side capture. Client-side logging is not an audit
trail because a user can close the tab, tamper with the browser, or hit the
underlying API directly.

## Current state

- `src/pages/AdminUsers.tsx` calls Better Auth admin client methods directly:
  `authClient.admin.setRole`, `authClient.admin.banUser`, and
  `authClient.admin.unbanUser`.
- `worker/app.ts` exposes custom admin OAuth client routes for list, create,
  update, rotate secret, and enable/disable.
- `worker/index.ts` implements those admin OAuth client actions but does not log
  them.
- `src/lib/nav.ts` has one admin-only nav item: `/admin/users`.
- `src/routes.tsx` has no admin audit route.
- `src/db/schema.ts` has auth, organization, OAuth, and team tables, but no
  audit/event table.

Admin user mutation excerpt:

```tsx
// src/pages/AdminUsers.tsx:125-160
const { error } = await authClient.admin.setRole({
	userId,
	role,
});
...
const { error } = await authClient.admin.banUser({
	userId,
	banReason: reason || undefined,
	banExpiresIn: expiresIn,
});
```

Admin OAuth mutation excerpt:

```ts
// worker/app.ts:507-537
export async function handleAdminOAuthClientAction(
	request: Request,
	env: Env,
	services: WorkerServices,
	clientId: string,
	action: string,
) {
	...
	if (action === "rotate-secret") {
		const rotated = await services.adminOAuth.rotateSecret(context, clientId);
		return json({ client: rotated });
	}
```

Repo conventions to match:

- Use pnpm only. Do not use npm or yarn.
- Bump `package.json` for the implementation change.
- Add file-level notes to new or meaningfully changed implementation files.
- Keep audit UI consistent with `design.md`: dense, neutral dashboard table or
  timeline, no decorative data cards.
- Do not log secrets, access tokens, refresh tokens, password reset links, magic
  links, OTPs, or raw request bodies.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Generate migration, if schema changes | `pnpm exec drizzle-kit generate` | creates one migration for audit table only |
| Targeted tests | `pnpm test -- src/lib/admin-audit.test.ts worker/app.test.ts src/routes.test.tsx` | exit 0, new audit tests pass |
| Full tests | `pnpm test` | exit 0, all tests pass |
| Lint | `pnpm lint` | exit 0, no ESLint errors |
| Typecheck without build artifacts | `pnpm exec tsc -b --noEmit` | exit 0, no TypeScript errors |
| Production build | `pnpm run build` | exit 0; this may update `dist/` |

If a migration is generated, inspect it before committing. It must only add the
audit table/indexes required by this plan.

## Scope

**In scope**:

- `package.json`
- `src/db/schema.ts`
- generated `drizzle/` migration and metadata files for the audit table only
- `src/lib/admin-audit.ts` (create)
- `src/lib/admin-audit.test.ts` (create)
- `src/pages/AdminUsers.tsx`
- `src/pages/AdminAudit.tsx` (create)
- `src/routes.tsx`
- `src/routes.test.tsx`
- `src/lib/nav.ts`
- `worker/app.ts`
- `worker/index.ts`
- `worker/app.test.ts`
- `plans/README.md`

**Out of scope**:

- External SIEM exports or webhooks.
- Tamper-evident hash chains.
- Organization-owned OAuth clients; those are plan 016.
- Logging successful sign-ins, normal session activity, or every user profile
  update.
- Client-only audit calls.
- Secret, token, OTP, or raw request body storage.

## Implementation steps

### 1. Add a narrow audit event model

Add an `adminAuditEvent` table to `src/db/schema.ts` and generate one Drizzle
migration. Suggested columns:

- `id` text primary key
- `createdAt` timestamp, default now, indexed
- `actorUserId` text nullable
- `actorEmail` text nullable
- `actorRole` text nullable
- `action` text not null, indexed
- `targetType` text not null, indexed
- `targetId` text nullable
- `targetLabel` text nullable
- `organizationId` text nullable for future tenant actions
- `ipAddress` text nullable
- `userAgent` text nullable
- `metadata` text nullable containing sanitized JSON

Keep the first model obvious. Do not add a full event-sourcing system.

Create `src/lib/admin-audit.ts` with:

- exported action constants
- exported target type constants
- a `sanitizeAuditMetadata` helper that recursively drops secret-like keys
- a small event input type used by worker services

At minimum, drop keys containing these case-insensitive fragments:

- `secret`
- `token`
- `password`
- `otp`
- `backup`
- `authorization`

### 2. Capture actor context server-side

Add a worker helper that extracts the current session user and admin status once
per privileged request. Reuse the existing admin/session checks in
`worker/app.ts`; do not create a second auth policy.

Each audit event should include:

- actor user id and email when available
- target id and label
- action
- request IP from Cloudflare headers when available
- user agent
- sanitized metadata with before/after values where cheap and safe

If IP extraction is ambiguous, store `CF-Connecting-IP` first, then fall back to
`X-Forwarded-For`, then omit it.

### 3. Log existing custom worker admin actions

Log these actions from `worker/index.ts` or the service layer behind
`worker/app.ts`:

- admin OAuth client create
- admin OAuth client update
- admin OAuth client rotate secret
- admin OAuth client disable
- admin OAuth client enable

For secret rotation, record that rotation occurred, the client id, and the
client label. Never store the new secret.

If authorization revocation is treated as a user self-service action, do not log
it as admin audit unless the route is explicitly admin/operator initiated by the
time you execute this plan.

### 4. Bring admin user mutations behind an auditable server boundary

First inspect the installed Better Auth admin plugin for server-side hooks or
events around role/ban/unban. Prefer a native server hook if it records the
actor and mutation after the Better Auth action succeeds.

If there is no suitable server hook, add custom worker endpoints for the three
mutations and update `src/pages/AdminUsers.tsx` to use them:

- `POST /api/admin/users/:userId/role`
- `POST /api/admin/users/:userId/ban`
- `POST /api/admin/users/:userId/unban`

The worker endpoint should:

1. require admin session
2. call the Better Auth server API for the mutation
3. log the audit event only after success
4. return the same success/failure shape the page needs

Do not log from the browser after `authClient.admin.*` calls. That is not the
audit boundary.

### 5. Add a read API and admin timeline page

Add:

- `GET /api/admin/audit-events`
- `src/pages/AdminAudit.tsx`
- route `/admin/audit`
- admin nav item labeled `Audit`

The read API should require admin session and return newest events first. Use a
simple limit/cursor or limit/offset shape consistent with existing worker tests.
Default to 50 events and cap at 100.

The page should show:

- timestamp
- action label
- actor email or user id
- target type/id/label
- concise metadata summary
- empty state
- loading and error states

Keep the UI scan-oriented. A table is acceptable and probably the most obvious
choice.

### 6. Add tests

Worker tests:

- non-admins cannot list audit events
- admins can list audit events newest first
- OAuth client create/update/rotate/disable/enable writes audit rows
- secret rotation events do not include the rotated secret
- admin user wrapper endpoints require admin session
- role/ban/unban wrapper endpoints log only after successful mutation

Unit tests:

- `sanitizeAuditMetadata` removes nested secret/token/password keys
- harmless before/after fields are preserved

Route/nav tests:

- `/admin/audit` is in `appRoutes`
- dashboard nav hides audit from non-admin users
- dashboard nav shows audit to admin users

### 7. Update docs and version

- Bump the root `package.json` patch version.
- Update `plans/README.md` status for plan 013 when complete.
- If README has an admin/operator section by then, add a short note that admin
  mutations are recorded in an audit timeline.

## STOP conditions

Stop and report if any of these occur:

- The only viable implementation logs admin mutations from the browser after the
  fact.
- Better Auth admin mutations cannot be wrapped or hooked server-side without
  changing auth behavior.
- A proposed event payload would store secrets, tokens, password reset links,
  OTPs, or raw request bodies.
- The audit table migration includes unrelated schema changes.
- In-scope files have drifted so far that the current-state excerpts no longer
  describe the code.

## Done criteria

- Admin OAuth client mutations are logged server-side.
- Admin user role/ban/unban mutations are logged server-side.
- Admins can view an audit timeline at `/admin/audit`.
- Non-admins cannot read audit events or call audit-backed admin wrappers.
- Secret-like values are redacted in tests.
- `pnpm test`, `pnpm lint`, `pnpm exec tsc -b --noEmit`, and
  `pnpm run build` pass.
- `plans/README.md` marks 013 as DONE after implementation.

## Maintenance notes

- Treat this as the audit foundation for future operator actions. Add new action
  constants near the helper, then log from the server path that performs the
  mutation.
- Prefer boring append-only events over clever reconstruction from current
  state. The current state can change; the event should describe what happened.
- If organization-owned OAuth clients land later, include `organizationId` on
  those audit events from the start.
