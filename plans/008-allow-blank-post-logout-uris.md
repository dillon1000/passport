# Plan 008: Allow blank optional post-logout URI lists

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- worker/app.ts worker/app.test.ts src/pages/Applications.tsx package.json`
> and `git diff --stat -- worker/app.ts worker/app.test.ts src/pages/Applications.tsx package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `dcbfe34`, 2026-06-15

## Why this matters

`postLogoutRedirectUris` is an optional OAuth client field, but the current
server schema rejects an empty list when the field is present. The Applications
UI always serializes the post-logout textarea as an array, so leaving that
optional field blank sends `[]` and fails validation. The fix should make
"blank optional list" mean "no post-logout URIs" without relaxing the required
`redirectUris` field.

## Current state

- `worker/app.ts` defines the admin OAuth input schemas and rejects empty URL arrays:

```ts
// worker/app.ts:155
const oauthURLArray = z.array(z.string().url()).min(1);

// worker/app.ts:157-160
const createOAuthClientSchema = z.object({
  name: z.string().trim().min(1),
  redirectUris: oauthURLArray,
  postLogoutRedirectUris: oauthURLArray.optional(),
```

- `src/pages/Applications.tsx` always sends a `postLogoutRedirectUris` array on create and update:

```ts
// src/pages/Applications.tsx:242-246
body: JSON.stringify({
  name: newClient.name,
  redirectUris: lines(newClient.redirectUris),
  postLogoutRedirectUris: lines(newClient.postLogoutRedirectUris),
  scopes: scopeList(newClient.scopes),
```

```ts
// src/pages/Applications.tsx:276-280
body: JSON.stringify({
  name: draft.name,
  redirectUris: lines(draft.redirectUris),
  postLogoutRedirectUris: lines(draft.postLogoutRedirectUris),
  scopes: scopeList(draft.scopes),
```

- Existing worker tests already cover OAuth client creation:

```ts
// worker/app.test.ts:396
it("creates an admin OAuth client and returns the one-time secret", async () => {
```

Repo conventions to match: worker route behavior is tested in `worker/app.test.ts`
with `createWorkerApp`, mocked services, and direct `app.fetch(...)` calls. Keep
the implementation obvious; do not add a new schema abstraction beyond what the
local Zod schemas need.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Focused tests | `pnpm test -- worker/app.test.ts` | exit 0; new tests pass |
| Full tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm run build` | exit 0 |

## Scope

**In scope**:
- `worker/app.ts`
- `worker/app.test.ts`
- `package.json` for the required patch version bump
- `plans/README.md` status update when done

**Out of scope**:
- `src/pages/Applications.tsx` unless the server-side schema change cannot
  preserve the existing UI payload shape.
- OAuth redirect URI scheme policy; that is a separate security finding.
- Any change to client secret display, OAuth client ownership, or admin checks.

## Git workflow

- Branch: `fix/blank-post-logout-uris`
- Commit message style: short imperative summary, for example `Allow blank post-logout URI lists`
- Do not push unless the operator explicitly asks.
- Do not add co-authors.

## Steps

### Step 1: Split required and optional URL array schemas

In `worker/app.ts`, keep `redirectUris` on a non-empty URL array, but allow
`postLogoutRedirectUris` to be an empty array when present.

Target shape:

```ts
const requiredOAuthURLArray = z.array(z.string().url()).min(1);
const optionalOAuthURLArray = z.array(z.string().url());

const createOAuthClientSchema = z.object({
  name: z.string().trim().min(1),
  redirectUris: requiredOAuthURLArray,
  postLogoutRedirectUris: optionalOAuthURLArray.optional(),
  ...
});
```

Do not rename public request fields. Do not relax `redirectUris`.

Also bump `package.json` patch version once as required by `AGENTS.md`. If the
version has changed since this plan was written, increment the current patch
version by one instead of hardcoding a target.

**Verify**: `pnpm lint` -> exit 0.

### Step 2: Add regression tests for empty post-logout lists

In `worker/app.test.ts`, add tests near the existing admin OAuth client tests:

- Creating a client with `postLogoutRedirectUris: []` returns `201` and calls
  `adminOAuth.create` with `postLogoutRedirectUris: []`.
- Updating a client with `postLogoutRedirectUris: []` returns `200` and calls
  `adminOAuth.update` with the empty list.
- A create request with `redirectUris: []` still returns `400`.

Use the existing `createEnv()`, mocked `adminOAuth`, and `createWorkerApp(...)`
patterns. Do not introduce real Better Auth or database dependencies in these
tests.

**Verify**: `pnpm test -- worker/app.test.ts` -> exit 0 and the new tests pass.

### Step 3: Run the full repo gates

Run the normal verification gates after the focused tests pass.

**Verify**:
- `pnpm test` -> exit 0
- `pnpm lint` -> exit 0
- `pnpm run build` -> exit 0

## Test plan

- Add one create regression test for `postLogoutRedirectUris: []`.
- Add one update regression test for `postLogoutRedirectUris: []`.
- Add one guard test proving `redirectUris: []` is still rejected.
- Reuse the structure of `worker/app.test.ts:396`.

## Done criteria

- [ ] `postLogoutRedirectUris: []` is accepted by the server schema.
- [ ] `redirectUris: []` remains rejected.
- [ ] `pnpm test` exits 0.
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm run build` exits 0.
- [ ] `package.json` patch version is bumped once.
- [ ] Only in-scope files are modified.
- [ ] `plans/README.md` status row for plan 008 is updated.

## STOP conditions

Stop and report back if:

- The live schema or Applications payload code does not match the excerpts.
- Accepting `postLogoutRedirectUris: []` causes the underlying Better Auth admin
  API to fail in local/manual verification.
- The fix appears to require changing OAuth client ownership, token behavior, or
  redirect URI scheme policy.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance notes

This plan intentionally treats an empty optional post-logout URI list as a valid
"none configured" state. If a later OAuth redirect URI policy plan tightens URL
schemes, it should update both required and optional URL schemas without
reintroducing the empty-list bug.
