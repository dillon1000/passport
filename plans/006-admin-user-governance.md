# Plan 006: Add admin user governance

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dcbfe34..HEAD -- src/auth.ts src/auth-client.ts src/db/schema.ts src/routes.tsx src/routes.test.tsx src/lib/nav.ts src/components/auth/dashboard-shell.tsx src/components/auth/dashboard-nav.tsx package.json plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `dcbfe34`, 2026-06-15

## Why this matters

Passport is an identity provider, and the code already enables Better Auth's
admin plugin and stores user governance fields such as role and ban state. The
current product only exposes OAuth client administration; there is no operator
surface for user support tasks such as finding a user, confirming role/status,
banning a compromised account, unbanning a recovered account, or correcting a
role. Adding a small, role-gated Users page gives operators the minimum control
plane they need without jumping to high-risk features like impersonation.

## Current state

- `src/auth.ts` enables the Better Auth admin plugin and assigns `admin` role
  on user creation when the email matches `ADMIN_EMAILS`.
- `src/auth-client.ts` installs `adminClient()`.
- `src/db/schema.ts` includes `role`, `banned`, `banReason`, and `banExpires`
  on the `user` table.
- `src/lib/nav.ts` has no Admin or Users destination.
- `src/components/auth/dashboard-shell.tsx` renders `DashboardNav` without
  passing the current user, so the nav cannot currently filter admin-only tabs.
- `src/routes.test.tsx` asserts the route and nav lists.

Admin role assignment:

```ts
// src/auth.ts:230-239
databaseHooks: {
	user: {
		create: {
			before: async (user) => ({
				data: {
					...user,
					role: isAdminEmail(env, user.email) ? "admin" : "user",
				},
			}),
		},
	},
},
```

Admin plugin registration:

```ts
// src/auth.ts:251-256
admin({
	defaultRole: "user",
	...(splitCsv(env.ADMIN_USER_IDS).length
		? { adminUserIds: splitCsv(env.ADMIN_USER_IDS) }
		: {}),
}),
```

Client plugin registration:

```ts
// src/auth-client.ts:18-43
export const authClient = createAuthClient({
	baseURL: authBaseURL,
	plugins: [
		adminClient(),
		agentAuthClient(),
		lastLoginMethodClient(),
		magicLinkClient(),
		organizationClient({
			teams: {
				enabled: true,
			},
		}),
		usernameClient(),
		phoneNumberClient(),
		twoFactorClient({
```

User schema fields:

```ts
// src/db/schema.ts:12-23
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  lastLoginMethod: text("last_login_method"),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
```

Current nav is static:

```ts
// src/lib/nav.ts:6-14
/** Top-level dashboard pages shown in the header tab strip. Add a page here. */
export const dashboardNav: NavItem[] = [
	{ href: "/account", label: "Account" },
	{ href: "/security", label: "Security" },
	{ href: "/sessions", label: "Sessions" },
	{ href: "/organizations", label: "Organizations" },
	{ href: "/applications", label: "Applications" },
	{ href: "/agents", label: "Agents" },
];
```

Dashboard shell does not pass user context into the nav:

```tsx
// src/components/auth/dashboard-shell.tsx:39-43
<AuthShell
	width="xl"
	breadcrumb={user ? name : <Skeleton className="h-4 w-20" />}
	nav={<DashboardNav />}
	actions={
```

Installed Better Auth admin API evidence:

```text
node_modules/better-auth/dist/plugins/admin/admin.d.mts
  listUsers
  banUser
  unbanUser
  setRole
  removeUser
  impersonateUser
```

Repo conventions to match:

- Use `pnpm` only.
- Keep the UI utilitarian and dense; follow `Applications` and `Security`
  page patterns for tables, status banners, dialogs, sheets, and destructive
  confirmations.
- Do not use nav filtering as authorization. Better Auth admin APIs must remain
  the enforcement boundary.
- Bump the root `package.json` patch version for implementation changes. If
  another plan already changed the version, increment from the live value.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| API reconnaissance | `rg -n "listUsers|banUser|unbanUser|setRole|removeUser|impersonateUser" -L node_modules/better-auth/dist/plugins/admin -g '*.d.mts' -g '*.mjs'` | exit 0 with matching Better Auth admin endpoints |
| Focused route tests | `pnpm test -- src/routes.test.tsx` | exit 0 |
| Full tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build/typecheck | `pnpm run build` | exit 0 |

## Scope

**In scope**:

- New `src/pages/AdminUsers.tsx`
- Optional helper/types file under `src/lib/admin-users.ts`
- Optional helper test under `src/lib/admin-users.test.ts`
- `src/routes.tsx`
- `src/routes.test.tsx`
- `src/lib/nav.ts`
- `src/components/auth/dashboard-shell.tsx`
- `src/components/auth/dashboard-nav.tsx`
- `package.json` patch version bump
- `plans/README.md` status update

**Out of scope**:

- Do not implement impersonation.
- Do not implement user deletion/removal in this first governance pass.
- Do not add custom user database endpoints unless Better Auth admin client
  APIs cannot perform the required listed actions.
- Do not edit generated `src/db/schema.ts` or migrations.
- Do not add audit-log storage in this plan; call out the follow-up in review
  if needed.
- Do not expose secrets or `.dev.vars` values.
- Do not push to GitHub unless the operator explicitly asks.

## Git workflow

- Branch: `feature/admin-user-governance`
- Base: latest `main` unless the operator explicitly approves another base.
- Commit message style: short imperative, matching existing history.
- Do not add a co-author.
- Do not push unless the operator asks.

## Steps

### Step 1: Confirm Better Auth admin method names and request shapes

Inspect the local installed admin plugin types and routes before coding:

- `node_modules/better-auth/dist/plugins/admin/admin.d.mts`
- `node_modules/better-auth/dist/plugins/admin/routes.mjs`
- `node_modules/better-auth/dist/plugins/admin/client.d.mts`

Confirm exact client calls for:

- list users, with pagination/search support if available
- set user role
- ban user
- unban user

Do not call or expose `impersonateUser` or `removeUser` even though the plugin
provides them.

**Verify**: `rg -n "listUsers|banUser|unbanUser|setRole|removeUser|impersonateUser" -L node_modules/better-auth/dist/plugins/admin -g '*.d.mts' -g '*.mjs'` exits 0.

### Step 2: Add an admin-aware nav model

Change the nav model without making nav an auth boundary.

Recommended shape:

```ts
// src/lib/nav.ts
export interface DashboardUserForNav {
	role?: string | null;
}

export interface NavItem {
	href: string;
	label: string;
	adminOnly?: boolean;
}

export const dashboardNav: NavItem[] = [
	...
	{ href: "/admin/users", label: "Users", adminOnly: true },
];

export function dashboardNavForUser(user?: DashboardUserForNav | null) {
	return dashboardNav.filter((item) => !item.adminOnly || user?.role === "admin");
}
```

Update:

- `DashboardShell` user type to include `role?: string | null`.
- `DashboardShell` to pass `user` into `<DashboardNav user={user} />`.
- `DashboardNav` to call `dashboardNavForUser(user)`.
- `src/routes.test.tsx` to assert base nav and admin-filter behavior.

If `role` is not reliably present on `session.user`, the Users page must still
work by relying on Better Auth admin API authorization; nav may show the item
only after the page or shell can prove the role. Do not add an insecure custom
role cache.

**Verify**: `pnpm test -- src/routes.test.tsx` exits 0.

### Step 3: Add the Admin Users page

Create `src/pages/AdminUsers.tsx` and route it at `/admin/users`.

The page should:

- Use `DashboardShell`.
- Render a compact searchable list of users from `authClient.admin.listUsers`.
- Show user name, email, id, role, email verification state, banned state, and
  ban expiration when available.
- Include pagination if `listUsers` supports `limit` and `offset`; otherwise
  keep the first page small and add a refresh action.
- Treat `401`/`403` or equivalent Better Auth errors as "No access" and show a
  restrained empty/error state.
- Keep the title "Users" and description focused on identity operations, not
  generic admin settings.

Do not add create-user, delete-user, impersonation, password reset, or email
change controls in this plan.

**Verify**: `pnpm run build` exits 0.

### Step 4: Add role and ban/unban actions

In `AdminUsers.tsx`, add:

- Role change action for `admin` and `user`, using `authClient.admin.setRole`.
- Ban action with a confirmation sheet/dialog collecting a short reason and
  optional expiration if the Better Auth API supports expiration.
- Unban action using `authClient.admin.unbanUser`.

Rules:

- Prevent obvious self-demotion/self-ban in the UI when the target user ID is
  the current signed-in user ID. Still rely on Better Auth for enforcement.
- Use destructive styling only for ban.
- Reload the list after every successful mutation.
- Surface failures through `StatusBanner`.
- Keep all action copy short and neutral.

**Verify**: `pnpm run build` exits 0.

### Step 5: Add focused tests and bump version

At minimum:

- Update `src/routes.test.tsx` for `/admin/users`.
- Add tests for `dashboardNavForUser`:
  - non-admin users do not see `/admin/users`
  - admin users do see `/admin/users`
  - personal tabs remain present for everyone
- If you add helper functions for formatting ban state, search params, or
  action eligibility, test them in `src/lib/admin-users.test.ts`.
- Increment the root `package.json` patch version from the live value.

**Verify**: `pnpm test`, `pnpm lint`, and `pnpm run build` all exit 0.

## Test plan

- `src/routes.test.tsx`: route list includes `/admin/users`.
- `src/routes.test.tsx` or helper test: admin nav filtering works and personal
  tabs remain visible.
- Optional `src/lib/admin-users.test.ts`:
  - ban expiration label for null and date values
  - self-action guard identifies the current user
  - search query trimming does not submit blank searches
- Full verification: `pnpm test`, `pnpm lint`, `pnpm run build`.

## Done criteria

All must hold:

- [ ] `/admin/users` exists and renders a role-gated user governance page.
- [ ] Admin users can list users through Better Auth admin APIs.
- [ ] Admin users can change `admin`/`user` role through Better Auth admin APIs.
- [ ] Admin users can ban and unban users through Better Auth admin APIs.
- [ ] The UI does not expose impersonation or user deletion.
- [ ] Non-admin users are not granted access by UI code; server/plugin
      authorization remains authoritative.
- [ ] Root `package.json` patch version is incremented.
- [ ] `pnpm test` exits 0.
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm run build` exits 0.
- [ ] `plans/README.md` status row for this plan is updated.

## STOP conditions

Stop and report back if:

- The live code differs materially from the excerpts in this plan.
- The installed Better Auth admin client lacks `listUsers`, `setRole`,
  `banUser`, or `unbanUser`.
- The only way to implement required behavior is direct database mutation.
- Role data is unavailable in the session and cannot be handled without adding
  an insecure client-side authorization assumption.
- The implementation appears to require user impersonation or user deletion.
- Verification fails twice after a reasonable fix attempt.

## Maintenance notes

This plan intentionally creates the smallest useful admin control surface.
Reviewers should scrutinize authorization boundaries, self-action guards,
destructive confirmation copy, and whether the page leaks more user data than
operators need. A future audit-log plan should capture who changed roles or ban
state, but that storage should not be bundled into this first pass.
