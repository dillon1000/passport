# Plan 005: Complete organization lifecycle and invitation acceptance

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dcbfe34..HEAD -- src/auth.ts src/auth-client.ts src/email.ts src/routes.tsx src/routes.test.tsx src/pages/Organizations.tsx src/components/auth/dashboard-shell.tsx src/components/auth/dashboard-nav.tsx src/lib/nav.ts package.json plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `dcbfe34`, 2026-06-15

## Why this matters

Passport already enables organizations, teams, invitations, and dynamic access
control, and the dashboard already exposes an Organizations page. The current
surface lets users create organizations, invite members, and create teams, but
it does not expose the normal lifecycle operations operators need: accept an
email invitation, cancel or resend stale invitations, change roles, remove
members, rename teams, or remove teams. Finishing this flow makes organizations
feel like a durable tenant primitive instead of scaffolding for a future
feature.

## Current state

- `src/auth.ts` configures the Better Auth organization plugin and sends
  invitation emails.
- `src/email.ts` sends invitation links to `/organization/invitation?id=...`.
- `src/routes.tsx` routes `/organizations` but does not route the invitation
  landing page.
- `src/pages/Organizations.tsx` lists organizations, members, invitations, and
  teams, but row actions are missing.
- `src/auth-client.ts` installs `organizationClient({ teams: { enabled: true } })`.
- `src/routes.test.tsx` asserts route and dashboard tab lists.

Organization plugin configuration:

```ts
// src/auth.ts:257-286
organization({
	allowUserToCreateOrganization: true,
	organizationLimit: 10,
	membershipLimit: 100,
	invitationExpiresIn: 60 * 60 * 24 * 7,
	invitationLimit: 100,
	cancelPendingInvitationsOnReInvite: true,
	requireEmailVerificationOnInvitation: true,
	dynamicAccessControl: {
		enabled: true,
		maximumRolesPerOrganization: 25,
	},
	teams: {
		enabled: true,
		maximumTeams: 25,
		maximumMembersPerTeam: 100,
		allowRemovingAllTeams: false,
	},
	sendInvitationEmail: async (data) => {
		const url = new URL("/organization/invitation", env.BETTER_AUTH_URL);
		url.searchParams.set("id", data.id);
		await sendOrganizationInvitationEmail(
			env,
			data.email,
			data.organization.name,
			data.inviter.user.name,
			url.toString(),
		);
	},
}),
```

Invitation email destination:

```ts
// src/email.ts:56-68
export async function sendOrganizationInvitationEmail(
	env: AuthEnv,
	email: string,
	organizationName: string,
	inviterName: string,
	url: string,
) {
	await sendAuthEmail(env, {
		to: email,
		subject: `Join ${organizationName} on Passport`,
		text: `${inviterName} invited you to join ${organizationName} on Passport: ${url}`,
		html: `<p>${inviterName} invited you to join ${organizationName} on Passport.</p><p><a href="${url}">Accept invitation</a></p>`,
	});
}
```

Route table today:

```tsx
// src/routes.tsx:35-50
{
	path: "/organizations",
	element: <Organizations />,
},
{
	path: "/applications",
	element: <Applications />,
},
{
	path: "/agents",
	element: <Agents />,
},
{
	path: "/agent/approve",
	element: <AgentApprove />,
},
```

The Organizations page currently creates, activates, invites, and creates
teams:

```tsx
// src/pages/Organizations.tsx:129-162
async function loadOrganizations() {
	setBusy("organizations");
	setStatus(null);
	const result = await authClient.organization.list();
	...
}

async function loadFullOrganization(organizationId?: string) {
	setBusy("active-organization");
	const result = await authClient.organization.getFullOrganization({
		query: organizationId ? { organizationId } : undefined,
	});
	...
}
```

```tsx
// src/pages/Organizations.tsx:220-250
async function inviteMember(event: FormEvent<HTMLFormElement>) {
	event.preventDefault();
	if (!activeOrganization) return;
	setBusy("invite-member");
	setStatus(null);
	const result = await authClient.organization.inviteMember({
		email: inviteEmail.trim(),
		role: inviteRole,
		organizationId: activeOrganization.id,
	});
	...
}

async function createTeam(event: FormEvent<HTMLFormElement>) {
	event.preventDefault();
	if (!activeOrganization) return;
	setBusy("create-team");
	setStatus(null);
	const result = await authClient.organization.createTeam({
```

Rows currently render without actions:

```tsx
// src/pages/Organizations.tsx:464-508
<ListBlock title={`Members (${activeMembers.length})`} empty="No members loaded.">
	{activeMembers.map((member) => {
		const display = member.user?.name || member.user?.email || member.userId;
		return (
			<li key={member.id} className="flex items-center gap-3 px-3 py-2.5">
				...
				<RoleBadge role={member.role} />
			</li>
		);
	})}
</ListBlock>
<ListBlock
	title={`Pending invitations (${pendingInvitations.length})`}
	empty="No pending invitations."
>
	{pendingInvitations.map((invitation) => (
		<li key={invitation.id} className="flex items-center gap-3 px-3 py-2.5">
```

Better Auth organization APIs are present in the installed package:

```text
node_modules/better-auth/dist/plugins/organization/organization.d.mts
  acceptInvitation, cancelInvitation, rejectInvitation
  removeMember, updateMemberRole
  createTeam, updateTeam, removeTeam
```

Repo conventions to match:

- Use `pnpm` only.
- Keep implementation files commented with short purpose/config notes when
  meaningfully changed.
- Use the existing dense `DashboardShell`, `SettingsCard`, `SettingsCardFooter`,
  `StatusBanner`, `Button`, `Badge`, `Dialog`, and `Sheet` patterns.
- Keep the neutral design language from `design.md`; no new decorative
  visuals, no marketing page, no card-in-card layout.
- Bump the root `package.json` patch version for implementation changes. If
  another plan already changed the version, increment from the live value.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| API reconnaissance | `rg -n "acceptInvitation|cancelInvitation|rejectInvitation|removeMember|updateMemberRole|updateTeam|removeTeam" -L node_modules/better-auth/dist/plugins/organization -g '*.d.mts' -g '*.mjs'` | exit 0 with matching Better Auth organization endpoints |
| Focused route tests | `pnpm test -- src/routes.test.tsx` | exit 0 |
| Full tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build/typecheck | `pnpm run build` | exit 0 |

## Scope

**In scope**:

- `src/pages/Organizations.tsx`
- New `src/pages/OrganizationInvitation.tsx`
- `src/routes.tsx`
- `src/routes.test.tsx`
- Optional new focused helpers/tests under `src/lib/organization-*`
- `package.json` patch version bump
- `plans/README.md` status update

**Out of scope**:

- Do not edit generated `src/db/schema.ts` or Drizzle migration files.
- Do not add custom database writes for organization lifecycle operations.
  Use Better Auth organization APIs.
- Do not add org-owned OAuth clients or tenant policy enforcement; that is a
  separate future plan.
- Do not add billing, SCIM, SAML, audit logs, or a new authorization system.
- Do not push to GitHub unless the operator explicitly asks.

## Git workflow

- Branch: `feature/organization-lifecycle`
- Base: latest `main` unless the operator explicitly approves another base.
- Commit message style: short imperative, matching existing history.
- Do not add a co-author.
- Do not push unless the operator asks.

## Steps

### Step 1: Confirm Better Auth organization method names

Inspect the installed package before editing UI code. Confirm the exact client
method names and request shapes for:

- accepting an invitation by ID
- rejecting an invitation by ID
- canceling an invitation by ID
- updating a member role
- removing a member
- updating a team
- removing a team

Use the local installed files first:

- `node_modules/better-auth/dist/plugins/organization/organization.d.mts`
- `node_modules/better-auth/dist/plugins/organization/routes/crud-invites.d.mts`
- `node_modules/better-auth/dist/plugins/organization/routes/crud-members.d.mts`
- `node_modules/better-auth/dist/plugins/organization/routes/crud-team.d.mts`

Do not guess API names. If the client method differs from the route name,
follow the client type.

**Verify**: `rg -n "acceptInvitation|cancelInvitation|rejectInvitation|removeMember|updateMemberRole|updateTeam|removeTeam" -L node_modules/better-auth/dist/plugins/organization -g '*.d.mts' -g '*.mjs'` exits 0 and shows the methods you will call.

### Step 2: Add the invitation landing page

Create `src/pages/OrganizationInvitation.tsx`.

Required behavior:

- Read the invitation ID from `?id=...`.
- If `id` is missing, show an error state in `AuthShell`.
- If no session is available, show a sign-in action that links to
  `/sign-in?callbackURL=<current path and query>`.
- If signed in, show a compact invitation confirmation screen with Accept and
  Decline actions.
- Accept calls the official Better Auth organization accept API.
- Decline calls the official Better Auth organization reject API.
- On accept success, navigate to `/organizations`.
- On reject success, show a final declined state and a link to `/account`.
- Keep copy short and neutral. Do not expose raw internal errors beyond the
  message returned by the client.

Wire the route in `src/routes.tsx`:

```tsx
{
	path: "/organization/invitation",
	element: <OrganizationInvitation />,
},
```

Add this path to `src/routes.test.tsx` in the route order assertion.

**Verify**: `pnpm test -- src/routes.test.tsx` exits 0 and includes
`/organization/invitation` in the route list.

### Step 3: Add member lifecycle actions

In `src/pages/Organizations.tsx`, add row actions for each member in the active
organization:

- Change role: owner/admin/member values only, using the existing role list
  style and the official `updateMemberRole` API.
- Remove member: confirmation dialog or sheet, using the official
  `removeMember` API.

Rules:

- Do not let the UI attempt to remove the current signed-in user from the last
  owner path unless Better Auth exposes and permits that exact operation.
- Prefer disabling unsafe buttons with a short hint over letting the call fail
  for obvious local cases.
- Always reload the active organization after a successful mutation by calling
  `loadFullOrganization(activeOrganization.id)`.
- Keep failures in the existing `StatusBanner`.

**Verify**: `pnpm run build` exits 0.

### Step 4: Add invitation lifecycle actions

For each pending invitation row:

- Cancel: call the official `cancelInvitation` API.
- Resend: call the existing invite flow again with the same email, role, and
  active organization ID. This matches current server config
  `cancelPendingInvitationsOnReInvite: true`, so a re-invite replaces the old
  pending invite.

Rules:

- Keep cancel behind a confirmation.
- Keep resend as an explicit button, not an automatic side effect.
- After either action, reload the active organization.
- If the Better Auth API exposes a first-class resend method, use that instead
  of re-inviting.

**Verify**: `pnpm run build` exits 0.

### Step 5: Add team lifecycle actions

For each team row:

- Rename: call the official `updateTeam` API.
- Remove: call the official `removeTeam` API.

Rules:

- Use a sheet or dialog, matching existing `Security` and `Applications` page
  patterns.
- Do not bypass Better Auth team constraints such as `allowRemovingAllTeams:
  false`; let the official API enforce the domain rules.
- After success, reload the active organization.

**Verify**: `pnpm run build` exits 0.

### Step 6: Add tests and bump version

At minimum:

- Update `src/routes.test.tsx` for the new route.
- If you create helper functions for invitation parsing, role labels, or
  action eligibility, add focused Vitest tests beside the helper.
- Increment the root `package.json` patch version from the live value.

Do not add browser automation for this plan unless a reviewer requests it.
Existing verification is unit/route tests plus TypeScript build.

**Verify**: `pnpm test`, `pnpm lint`, and `pnpm run build` all exit 0.

## Test plan

- `src/routes.test.tsx`: route list includes `/organization/invitation`.
- Optional helper tests:
  - missing invitation ID produces an invalid state
  - pending invitations are filtered by `status === "pending"`
  - role options stay limited to owner/admin/member
- Existing tests must keep passing with `pnpm test`.

## Done criteria

All must hold:

- [ ] `/organization/invitation?id=<id>` is routed and renders a real accept/
      decline flow.
- [ ] Organization member rows support role change and removal through Better
      Auth APIs.
- [ ] Pending invitation rows support cancel and resend.
- [ ] Team rows support rename and remove.
- [ ] No generated schema or migration files are modified.
- [ ] Root `package.json` patch version is incremented.
- [ ] `pnpm test` exits 0.
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm run build` exits 0.
- [ ] `plans/README.md` status row for this plan is updated.

## STOP conditions

Stop and report back if:

- The live code differs materially from the excerpts in this plan.
- The installed Better Auth organization client does not expose the required
  lifecycle methods.
- Implementing a required action appears to require direct writes to
  `src/db/schema.ts` tables or custom SQL.
- A lifecycle API requires a schema/migration change not already generated by
  Better Auth tooling.
- Verification fails twice after a reasonable fix attempt.

## Maintenance notes

This plan intentionally finishes lifecycle management without changing tenant
authorization semantics. Future work that makes OAuth clients organization-owned
or adds tenant policy enforcement should build on this page but should not be
mixed into this change. Reviewers should scrutinize destructive actions,
current-user edge cases, and whether every mutation reloads the active
organization after success.
