# Plan 015: Build permissions policy engine

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- package.json README.md src/db/schema.ts src/lib/oauth-policy.ts src/lib/oauth-policy.test.ts src/lib/oauth-scope-claims.ts src/lib/oauth-scope-claims.test.ts src/lib/oauth-scopes.ts plans/README.md`
> and `git diff --stat -- package.json README.md src/db/schema.ts src/lib/oauth-policy.ts src/lib/oauth-policy.test.ts src/lib/oauth-scope-claims.ts src/lib/oauth-scope-claims.test.ts src/lib/oauth-scopes.ts plans/README.md`.
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: 011, 014
- **Category**: direction
- **Planned at**: commit `dcbfe34`, 2026-06-16

## Why this matters

Passport advertises a `permissions` OAuth scope and emits three namespaced
policy claims: roles, permissions, and entitlements. Today those claims are
hardcoded to `roles: ["authenticated"]`, `permissions: []`, and
`entitlements: []`. That is safe, but it makes the scope mostly symbolic and
pushes downstream apps to invent their own tenant policy layer.

The repo already has `organization_role` rows from Better Auth dynamic access
control. This plan turns those rows plus real organization memberships into a
deterministic policy output. The first version should be intentionally small:
authenticated users get an `authenticated` role, organization memberships become
tenant-scoped role strings, and organization role permissions become
tenant-scoped permission strings.

## Current state

- `src/lib/oauth-scopes.ts` defines and advertises the `permissions` scope.
- `src/lib/oauth-scope-claims.ts` defines `OAuthPolicyClaims`.
- `loadOAuthClaimContext` loads organizations and teams from membership tables.
- `loadOAuthClaimContext` does not read `organization_role`.
- `src/db/schema.ts` already includes `organizationRole` with
  `organizationId`, `role`, and `permission`.
- Policy claims are emitted only when the granted scope includes `permissions`.

Current policy type:

```ts
// src/lib/oauth-scope-claims.ts:42-46
export type OAuthPolicyClaims = {
	roles: string[];
	permissions: string[];
	entitlements: string[];
};
```

Current hardcoded policy:

```ts
// src/lib/oauth-scope-claims.ts:353-361
// Policy claims are downstream authorization outputs, not raw Passport admin flags.
policy: {
	roles: ["authenticated"],
	permissions: [],
	entitlements: [],
},
```

Existing dynamic access control table:

```ts
// src/db/schema.ts:115-133
export const organizationRole = pgTable(
	"organization_role",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		role: text("role").notNull(),
		permission: text("permission").notNull(),
```

Claim emission:

```ts
// src/lib/oauth-scope-claims.ts:214-221
function policyClaims(env: ClaimEnv, scopes: readonly string[], context: OAuthClaimContext) {
	if (!hasScope(scopes, "permissions")) return {};

	return {
		[oauthClaimURL(env, "roles")]: context.policy.roles,
		[oauthClaimURL(env, "permissions")]: context.policy.permissions,
		[oauthClaimURL(env, "entitlements")]: context.policy.entitlements,
	};
}
```

Repo conventions to match:

- Use pnpm only. Do not use npm or yarn.
- Bump `package.json` for the implementation change.
- Add file-level notes to new or meaningfully changed implementation files.
- Keep authorization outputs tenant-scoped. Do not create global-looking
  permission strings from organization-local roles.
- Do not leak Passport admin flags as OAuth policy roles.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Better Auth role format recon | `rg "organization_role|dynamicAccessControl|permission" node_modules/better-auth node_modules/@better-auth -g "*.d.ts" -g "*.js"` | understand stored permission format |
| Targeted tests | `pnpm test -- src/lib/oauth-policy.test.ts src/lib/oauth-scope-claims.test.ts` | exit 0, new policy tests pass |
| Full tests | `pnpm test` | exit 0, all tests pass |
| Lint | `pnpm lint` | exit 0, no ESLint errors |
| Typecheck without build artifacts | `pnpm exec tsc -b --noEmit` | exit 0, no TypeScript errors |
| Production build | `pnpm run build` | exit 0; this may update `dist/` |

## Scope

**In scope**:

- `package.json`
- `README.md` if OAuth claim docs need correction
- `src/lib/oauth-policy.ts` (create)
- `src/lib/oauth-policy.test.ts` (create)
- `src/lib/oauth-scope-claims.ts`
- `src/lib/oauth-scope-claims.test.ts`
- `src/lib/oauth-scopes.ts` only if consent/scope copy must be clarified
- `plans/README.md`

**Out of scope**:

- Database schema changes.
- Admin UI for editing dynamic organization roles.
- Team-level permissions.
- Entitlement billing/subscription logic.
- Organization-owned OAuth clients; plan 016 handles that design.
- Global Passport admin role claims.

## Implementation steps

### 1. Confirm the stored permission format

Before implementing the builder, inspect the installed Better Auth package and
any generated schema docs to confirm how `organization_role.permission` is
stored.

Proceed only if the format can be interpreted deterministically as one or more
permission strings. Acceptable examples:

- a plain string such as `project:read`
- a JSON string array such as `["project:read", "project:write"]`
- a documented JSON object that maps resources to actions and can be normalized
  to strings such as `project:read`

If the format is undocumented or ambiguous, stop and report. Do not guess and
ship a misleading OAuth permission claim.

### 2. Add a small policy builder

Create `src/lib/oauth-policy.ts` with a file-level note explaining:

- inputs: authenticated user memberships and organization role permission rows
- outputs: OAuth policy roles, permissions, and entitlements
- safe configuration point: string formatting constants

Recommended first-pass contract:

- `roles` always includes `authenticated`
- each organization membership adds
  `organization:<organizationId>:<role>`
- each matching organization role permission adds
  `organization:<organizationId>:<permission>`
- `entitlements` remains empty until a real entitlement source exists
- outputs are sorted and deduplicated

Keep the string format stable and test it. If you choose a different format,
document why it is more obvious for downstream clients and update README.

### 3. Load organization role permissions

Update `loadOAuthClaimContext` to read `organizationRole` rows for the current
user's organization memberships:

- Only match rows where `organizationRole.organizationId` equals a membership
  organization id.
- Only match rows where `organizationRole.role` equals that membership's role.
- Do not include permissions for roles the user does not hold.
- Do not include permissions for organizations where the user has no
  membership.
- If there are no memberships, avoid an unnecessary role-permission query.

Use the policy builder to produce `context.policy`.

### 4. Keep claim emission scope-gated

Do not change the rule that policy claims are emitted only when the OAuth grant
includes `permissions`.

Do not add policy claims to ID tokens unless the repo has an explicit product
reason by execution time. The current access-token and userinfo behavior is the
right first surface.

### 5. Add tests

Policy builder unit tests:

- unaffiliated user gets only `authenticated`, no permissions, no entitlements
- membership role becomes `organization:<id>:<role>`
- matching organization role permission becomes
  `organization:<id>:<permission>`
- duplicate memberships/permissions are deduplicated and sorted
- permissions for other organizations are ignored
- permissions for roles the user does not hold are ignored
- JSON permission format is parsed if and only if it is documented/supported

OAuth claim tests:

- `permissions` scope emits namespaced role/permission/entitlement claims
- missing `permissions` scope emits no policy claims
- access token gets compact policy output when scope includes `permissions`
- userinfo gets the same policy output when scope includes `permissions`

### 6. Update scope copy and docs

If `src/lib/oauth-scopes.ts` currently describes `permissions` too broadly,
adjust the copy to say the scope exposes tenant-scoped authorization outputs.

Update README's OAuth claim section to document:

- `permissions` scope is required
- roles are tenant-scoped strings
- permissions are tenant-scoped strings
- entitlements are currently reserved and empty unless a future entitlement
  source is added

### 7. Update version and plan status

- Bump the root `package.json` patch version.
- Update `plans/README.md` status for plan 015 when complete.

## STOP conditions

Stop and report if any of these occur:

- `organization_role.permission` format cannot be confirmed.
- The only implementation path would emit unscoped global permission strings
  for organization-local policy.
- The implementation would expose Passport admin/user roles as OAuth policy
  roles.
- Tests require fabricating policy data that Better Auth cannot actually store.
- In-scope files have drifted so far that the current-state excerpts no longer
  describe the code.

## Done criteria

- `permissions` scope emits deterministic tenant-scoped policy output.
- Policy output derives from real organization memberships and
  `organization_role` rows.
- Users do not receive permissions for organizations or roles they do not hold.
- Entitlements remain empty and explicitly reserved.
- `pnpm test`, `pnpm lint`, `pnpm exec tsc -b --noEmit`, and
  `pnpm run build` pass.
- `plans/README.md` marks 015 as DONE after implementation.

## Maintenance notes

- Keep policy building pure and separately tested. Token/userinfo builders
  should only decide where claims are emitted.
- If team-level permissions are introduced later, extend the builder input with
  team policy rows rather than querying from claim emission functions.
- If entitlements get a real source later, add that source explicitly. Do not
  infer entitlements from billing UI placeholders.
