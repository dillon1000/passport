# Plan 010: Paginate and batch OAuth application lists

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- worker/app.ts worker/index.ts worker/app.test.ts src/pages/Applications.tsx package.json`
> and `git diff --stat -- worker/app.ts worker/index.ts worker/app.test.ts src/pages/Applications.tsx package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/008-allow-blank-post-logout-uris.md
- **Category**: perf
- **Planned at**: commit `dcbfe34`, 2026-06-15

## Why this matters

The Applications page can grow in two directions: user-authorized applications
and admin-managed OAuth clients. Today both surfaces return and render complete
collections, and the authorized-app list performs one client lookup per consent.
This plan adds bounded API responses and UI "load more" behavior, and it
replaces per-consent client hydration with one batched lookup. The goal is a
scalable first page by default without changing the existing top-level response
array names.

## Current state

- `worker/app.ts` service contracts return unpaged arrays:

```ts
// worker/app.ts:44-47
export type ApplicationService = {
  list: (context: ApplicationContext) => ApplicationSummary[] | Promise<ApplicationSummary[]>;
  revoke: (context: ApplicationRevokeContext) => void | Promise<void>;
};
```

```ts
// worker/app.ts:83-84
export type AdminOAuthService = {
  list: (context: AdminOAuthContext) => OAuthClientSummary[] | Promise<OAuthClientSummary[]>;
```

- `worker/app.ts` returns all summaries directly:

```ts
// worker/app.ts:269-274
const summaries = await applications.list({
  request,
  env,
  session: sessionResult.session,
});
return Response.json({ applications: summaries });
```

- `worker/index.ts` hydrates authorized applications with one lookup per consent:

```ts
// worker/index.ts:101-107
const consents = (await authInstance.api.getOAuthConsents({
  headers: request.headers,
})) as OAuthConsentAPIShape[];
const applications = await Promise.all(
  consents.map(async (consent) => {
    const client = (await authInstance.api.getOAuthClientPublic({
```

- Admin client listing is also unpaged:

```ts
// worker/index.ts:140-145
list: async ({ request, env }) => {
  const clients =
    ((await auth(env as AuthEnv).api.getOAuthClients({
      headers: request.headers,
    })) as OAuthClientAPIShape[] | null) ?? [];
  return clients.map((client) => redactClientSecret(mapOAuthClient(client)));
},
```

- The UI renders all rows:

```tsx
// src/pages/Applications.tsx:403-405
) : applications.length ? (
  <ul className="divide-y">
    {applications.map((application) => (
```

```tsx
// src/pages/Applications.tsx:540-542
{clients.length ? (
  <div className="divide-y overflow-hidden rounded-lg border">
    {clients.map((client) => {
```

Repo conventions to match: worker route tests use mocked services in
`worker/app.test.ts`; UI follows `SettingsCard`, `SettingsCardFooter`, and
small outline buttons with Lucide icons in `src/pages/Applications.tsx`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Focused worker tests | `pnpm test -- worker/app.test.ts` | exit 0 |
| Full tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm run build` | exit 0 |

## Scope

**In scope**:
- `worker/app.ts`
- `worker/index.ts`
- `worker/app.test.ts`
- `src/pages/Applications.tsx`
- `package.json` for the required patch version bump
- `plans/README.md` status update when done

**Out of scope**:
- Changing OAuth consent semantics or revocation behavior.
- Changing admin authorization rules.
- Changing client secret display or rotation behavior.
- Refactoring the whole Applications page into smaller components.
- Replacing offset cursors with keyset cursors; this plan uses a simple bounded
  cursor first.

## Git workflow

- Branch: `perf/oauth-list-pagination`
- Commit message style: short imperative summary, for example `Paginate OAuth application lists`
- Do not push unless the operator explicitly asks.
- Do not add co-authors.

## Steps

### Step 1: Add page input and output types to the worker app boundary

In `worker/app.ts`, add small shared types:

```ts
type PageInput = {
  limit: number;
  cursor?: string;
};

type PageResult<T> = {
  items: T[];
  nextCursor?: string;
};
```

Update service contracts:

- `ApplicationService.list(context, page)` returns `PageResult<ApplicationSummary>`.
- `AdminOAuthService.list(context, page)` returns `PageResult<OAuthClientSummary>`.

Add a helper in `worker/app.ts` that parses `limit` and `cursor` from the
request URL:

- Default limit: `25`
- Maximum limit: `100`
- Cursor format: decimal offset string, absent for the first page
- Invalid limit or cursor: return `400` JSON error

Keep top-level response keys stable:

```json
{
  "applications": [],
  "page": { "limit": 25, "nextCursor": "25" }
}
```

```json
{
  "clients": [],
  "page": { "limit": 25, "nextCursor": "25" }
}
```

Omit `nextCursor` when there is no next page.

Also bump `package.json` patch version once as required by `AGENTS.md`. If the
version has changed since this plan was written, increment the current patch
version by one instead of hardcoding a target.

**Verify**: `pnpm lint` -> exit 0.

### Step 2: Add worker route tests for pagination contracts

In `worker/app.test.ts`, add tests for:

- `GET /api/applications?limit=1&cursor=1` passes `{ limit: 1, cursor: "1" }`
  to the mocked `applications.list` service and returns `{ applications, page }`.
- `GET /api/admin/oauth-clients?limit=1&cursor=1` passes the same page input to
  mocked `adminOAuth.list` and returns `{ clients, page }`.
- Invalid pagination input, such as `?limit=0`, returns `400` and does not call
  the service.

Use mocked services only; do not require a database in `worker/app.test.ts`.

**Verify**: `pnpm test -- worker/app.test.ts` -> exit 0.

### Step 3: Implement bounded application and client services

In `worker/index.ts`, implement the new `PageInput` contract.

For authorized applications:

1. Prefer a scoped Drizzle query over `schema.oauthConsent` filtered by
   `session.user.id`, ordered by newest `updatedAt`/`createdAt`/`id`, with
   `limit + 1` and an offset parsed from the cursor.
2. Hydrate OAuth client metadata in one batched query against
   `schema.oauthClient` for the page's distinct client IDs.
3. Map back to the existing `ApplicationSummary` shape.
4. Return `nextCursor` only when `limit + 1` rows were fetched.

For admin-managed clients:

1. Prefer a scoped Drizzle query over `schema.oauthClient` filtered to the
   current admin's owned clients if the database rows have `userId` set for
   admin-created clients.
2. Order newest first with stable tie-breaking, fetch `limit + 1`, and return
   existing `OAuthClientSummary` values without `clientSecret`.
3. If local inspection shows admin-created OAuth client rows do not carry a
   reliable `userId`, STOP and report instead of silently changing ownership
   semantics.

Expected imports will likely include `desc`, `eq`, and `inArray` from
`drizzle-orm`; match the existing Drizzle style in `worker/index.ts`.

**Verify**:
- `pnpm test -- worker/app.test.ts` -> exit 0
- `pnpm run build` -> exit 0

### Step 4: Add "load more" behavior to the Applications UI

In `src/pages/Applications.tsx`:

- Track `applicationNextCursor` and `clientNextCursor`.
- Let `loadApplications` and `loadClients` accept an optional `{ append: true }`
  mode.
- On initial load and refresh, request `/api/applications?limit=25` and
  `/api/admin/oauth-clients?limit=25`.
- On load more, include `cursor=<nextCursor>` and append rows instead of
  replacing them.
- Render a small outline `Load more` button below each list when a next cursor
  exists.
- Preserve existing empty, loading, refresh, revoke, create, update, rotate, and
  disable/enable behaviors.

Use the existing `Button`, `RefreshCw`, `SettingsCardFooter`, and `cn` patterns.
Do not introduce virtualization in this plan.

**Verify**:
- `pnpm lint` -> exit 0
- `pnpm run build` -> exit 0

### Step 5: Run the full repo gates

Run the normal verification gates after focused tests and build pass.

**Verify**:
- `pnpm test` -> exit 0
- `pnpm lint` -> exit 0
- `pnpm run build` -> exit 0

## Test plan

- Add worker route contract tests for pagination input and response metadata.
- Preserve existing authorized application and admin OAuth client tests.
- Add at least one test that invalid pagination input returns `400`.
- If service-level DB helpers are extracted, add direct unit tests for cursor
  parsing and `nextCursor` calculation.

## Done criteria

- [ ] `/api/applications` accepts `limit` and `cursor`.
- [ ] `/api/admin/oauth-clients` accepts `limit` and `cursor`.
- [ ] Both endpoints keep their existing top-level array keys and add `page`.
- [ ] Authorized application client metadata is hydrated with one batched lookup
      for the current page, not one lookup per consent.
- [ ] Applications UI can load the first page, refresh it, and append more rows.
- [ ] `pnpm test` exits 0.
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm run build` exits 0.
- [ ] `package.json` patch version is bumped once.
- [ ] Only in-scope files are modified.
- [ ] `plans/README.md` status row for plan 010 is updated.

## STOP conditions

Stop and report back if:

- The live Applications page or worker service contracts do not match the
  excerpts.
- Better Auth-owned OAuth client rows do not contain enough ownership data to
  safely replace `getOAuthClients` with a direct DB query.
- Pagination requires changing OAuth consent, revocation, admin authorization,
  or client secret response semantics.
- The fix requires a full Applications page refactor.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance notes

This plan uses a simple decimal offset cursor because it is easy to reason about
and sufficient to bound first-page payloads. If installations grow large enough
that deep offsets matter, replace the cursor with a keyset cursor over
`updatedAt`/`createdAt`/`id` in a follow-up without changing the UI contract.
