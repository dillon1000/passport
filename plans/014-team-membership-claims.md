# Plan 014: Finish team membership behind team claims

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- package.json src/auth-client.ts src/pages/Organizations.tsx src/lib/organization-lifecycle.ts src/lib/organization-lifecycle.test.ts src/lib/oauth-scope-claims.ts src/lib/oauth-scope-claims.test.ts plans/README.md`
> and `git diff --stat -- package.json src/auth-client.ts src/pages/Organizations.tsx src/lib/organization-lifecycle.ts src/lib/organization-lifecycle.test.ts src/lib/oauth-scope-claims.ts src/lib/oauth-scope-claims.test.ts plans/README.md`.
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MEDIUM
- **Depends on**: 005, 011
- **Category**: direction
- **Planned at**: commit `dcbfe34`, 2026-06-16

## Why this matters

Passport advertises `teams` and `teams:ids` OAuth scopes, and the claim builder
already reads the `team_member` table. The UI lets users create, rename, and
delete teams, but it does not give organization admins an obvious way to put
members into those teams. That leaves the team claims structurally present but
operationally hard to use.

This plan connects the existing Better Auth team membership model to the
Organizations page and hardens the team-claim tests so OAuth clients only see
teams the user actually belongs to.

## Current state

- `better-auth` organization teams are enabled on the server.
- `authClient` enables organization teams on the client.
- `src/db/schema.ts` already has `team` and `team_member`; no new table is
  needed for basic team assignment.
- `src/pages/Organizations.tsx` models `OrganizationTeam` without member lists.
- The Teams section only supports create, rename, upload logo, and remove.
- `src/lib/oauth-scope-claims.ts` loads teams through `teamMember`, so claim
  logic is already oriented around membership.
- `src/lib/organization-lifecycle.ts` has small UI policy helpers for org role
  and removal safety.

Server/client team enablement:

```ts
// src/auth.ts:281-286
teams: {
	enabled: true,
	maximumTeams: 25,
	maximumMembersPerTeam: 100,
	allowRemovingAllTeams: false,
},
```

```ts
// src/auth-client.ts:25-29
organizationClient({
	teams: {
		enabled: true,
	},
```

Current team type and UI scope:

```tsx
// src/pages/Organizations.tsx:91-97
type OrganizationTeam = {
	id: string;
	name: string;
	logo?: string | null;
	organizationId: string;
	createdAt?: string | Date | null;
};
```

```tsx
// src/pages/Organizations.tsx:934-1002
{selectedOrganization.teams.map((team) => (
	<Card key={team.id} className="overflow-hidden">
		...
		<Button ... onClick={() => void renameTeam(team.id)}>Save</Button>
		<Button ... onClick={() => void removeTeam(team.id)}>Remove</Button>
```

Claim loader already uses `team_member`:

```ts
// src/lib/oauth-scope-claims.ts:309-327
const teams = await db
	.select({
		id: schema.team.id,
		name: schema.team.name,
		organizationId: schema.organization.id,
		organizationName: schema.organization.name,
		organizationSlug: schema.organization.slug,
	})
	.from(schema.teamMember)
	.innerJoin(schema.team, eq(schema.teamMember.teamId, schema.team.id))
```

Repo conventions to match:

- Use pnpm only. Do not use npm or yarn.
- Bump `package.json` for the implementation change.
- Add file-level notes to new or meaningfully changed implementation files.
- Use Better Auth's organization/team APIs as the enforcement boundary.
- Keep the Organizations UI consistent with `design.md`: dense dashboard
  controls, restrained text, no explanatory feature panels.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Better Auth API recon | `rg "team" node_modules/better-auth node_modules/@better-auth -g "*.d.ts"` | identify supported team member client/server methods |
| Targeted tests | `pnpm test -- src/lib/organization-lifecycle.test.ts src/lib/oauth-scope-claims.test.ts` | exit 0, new helper/claim tests pass |
| Full tests | `pnpm test` | exit 0, all tests pass |
| Lint | `pnpm lint` | exit 0, no ESLint errors |
| Typecheck without build artifacts | `pnpm exec tsc -b --noEmit` | exit 0, no TypeScript errors |
| Production build | `pnpm run build` | exit 0; this may update `dist/` |

## Scope

**In scope**:

- `package.json`
- `src/auth-client.ts` only if type/plugin configuration must be adjusted
- `src/pages/Organizations.tsx`
- `src/lib/organization-lifecycle.ts`
- `src/lib/organization-lifecycle.test.ts`
- `src/lib/oauth-scope-claims.ts` only if tests expose claim leakage or missing
  membership filtering
- `src/lib/oauth-scope-claims.test.ts`
- `plans/README.md`

**Out of scope**:

- New database tables or migrations for basic team assignment.
- Direct writes to Better Auth tables from UI code.
- Team-level custom roles or permissions; plan 015 handles policy output.
- Organization-owned OAuth clients; plan 016 handles that design.
- SCIM/SAML group sync.

## Implementation steps

### 1. Confirm the Better Auth team API

Before editing UI, inspect installed Better Auth types and source for the
official team member methods. Look for add/remove/list team member operations in:

- `better-auth/client/plugins`
- `better-auth/plugins/organization`
- generated client types exposed through `organizationClient({ teams: ... })`

Use those APIs. Do not write directly to `team_member` from the browser or from
a custom endpoint unless Better Auth explicitly documents that as the supported
extension path.

If Better Auth only supports assigning teams during invitation, confirm whether
accepted invitations populate `team_member` and design the UI around the
documented flow.

### 2. Extend local organization types from real API output

Update `OrganizationTeam` and related local types to represent whatever Better
Auth returns for team members. The UI needs enough data to display:

- member user id
- member name or email
- member role in the organization if available
- membership id if the remove API requires it

If the full organization response does not include team members, add a
separate team-member fetch using a documented Better Auth method. Keep the data
shape local to the Organizations page unless it becomes reusable.

### 3. Add team assignment controls

In the Teams section of `src/pages/Organizations.tsx`:

- Show current team members under each team.
- Provide an add-member control populated from the selected organization's
  existing members.
- Do not show users who already belong to that team in the add list.
- Provide a remove-member action for each team member.
- Keep existing create, rename, logo upload, and remove-team behavior.
- Use existing buttons, inputs, badges, sheets/dialog patterns, and icons.
- Keep copy short and operational.

Disable or hide assignment controls when:

- no organization is selected
- there are no organization members to add
- a mutation is in flight for that team

Let Better Auth enforce role permissions. UI guards are only affordances.

### 4. Optional invitation team selection

If Better Auth's invite API supports `teamId` or equivalent and the current
types expose it, add an optional team selector to the invite-member sheet. This
is useful because `src/db/schema.ts` already has `invitation.teamId`.

If the installed API does not support invitation team selection cleanly, defer
this part. Do not invent a parallel invite flow.

### 5. Harden team claim tests

In `src/lib/oauth-scope-claims.test.ts`, ensure tests cover:

- users receive `teams` claims only for teams where they have a `team_member`
  row
- `teams:ids` access-token claims contain only assigned team ids
- organizations are not inferred from unassigned teams
- removing all team memberships results in no team claims

If these tests fail against the existing loader, fix `loadOAuthClaimContext`
within this plan. The loader should remain a direct membership query, not a
query for every team in every organization.

### 6. Add UI policy helpers only where they clarify behavior

Extend `src/lib/organization-lifecycle.ts` for simple decisions such as:

- whether a member can be offered in an add-to-team menu
- whether a team member can be removed from a specific team list

Do not add a large permission abstraction. Better Auth is the enforcement
boundary for this plan.

### 7. Update docs and version

- Bump the root `package.json` patch version.
- Update `plans/README.md` status for plan 014 when complete.
- If README documents organization teams by then, add a short note that teams
  can manage member assignment and feed OAuth team claims.

## STOP conditions

Stop and report if any of these occur:

- The installed Better Auth version has no documented team member add/remove
  API and implementation would require direct table writes.
- Team assignment can only be done by changing OAuth claim code without a real
  organization/team mutation path.
- The UI would imply a user is assigned to a team before the server confirms it.
- Tests reveal team claims include teams the user is not actually assigned to
  and the fix requires a schema change.
- In-scope files have drifted so far that the current-state excerpts no longer
  describe the code.

## Done criteria

- Organization admins have an obvious UI path to add and remove members from
  teams using Better Auth APIs.
- Team claim tests prove OAuth clients only receive assigned teams.
- Existing team create/rename/logo/remove workflows still work.
- No direct browser writes to Better Auth tables are introduced.
- `pnpm test`, `pnpm lint`, `pnpm exec tsc -b --noEmit`, and
  `pnpm run build` pass.
- `plans/README.md` marks 014 as DONE after implementation.

## Maintenance notes

- Keep team membership as the source of truth for OAuth team claims. Do not
  derive team claims from organization membership alone.
- If team-level permissions are added later, put that in the policy layer from
  plan 015 instead of expanding the Organizations page into an authorization
  engine.
- If Better Auth changes team API names in a future upgrade, update
  `src/auth-client.ts` and the Organizations page together so generated client
  methods stay typed.
