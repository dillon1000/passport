# Plan 016: Design organization-owned OAuth clients and tenant policy

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- package.json README.md docs src/db/schema.ts src/pages/Applications.tsx src/pages/Organizations.tsx src/pages/Consent.tsx worker/app.ts worker/index.ts src/lib/oauth-scope-claims.ts src/lib/oauth-policy.ts plans/README.md`
> and `git diff --stat -- package.json README.md docs src/db/schema.ts src/pages/Applications.tsx src/pages/Organizations.tsx src/pages/Consent.tsx worker/app.ts worker/index.ts src/lib/oauth-scope-claims.ts src/lib/oauth-policy.ts plans/README.md`.
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: 012, 013, 014, 015
- **Category**: direction
- **Planned at**: commit `dcbfe34`, 2026-06-16

## Why this matters

Managed OAuth clients are currently provider-admin assets. The schema stores a
`userId` owner on `oauth_client`, the Applications page describes managed
clients as owned by the admin account, and admin-only routes control client
create/update/rotate/disable. That works for a single operator, but it does not
answer the next enterprise question: which organization owns this client, which
organization admins can rotate it, and which tenant policy constrains its
scopes?

This plan is intentionally a design/RFC plan, not the migration itself. Org-owned
OAuth clients affect schema, Better Auth OAuth provider integration, consent
metadata, audit events, organization permissions, admin UI, and future SCIM/SAML
work. A written design should land before implementation so the eventual build
has a boring data model and avoids one-off exceptions.

## Current state

- `src/db/schema.ts` defines `oauthClient.userId` and relates OAuth clients to
  `user`, not `organization`.
- `src/pages/Applications.tsx` describes managed clients as "OAuth clients owned
  by this admin account".
- `worker/app.ts` exposes admin-only OAuth client management routes under
  `/api/admin/oauth-clients`.
- `worker/index.ts` implements those routes through Better Auth admin OAuth APIs.
- `README.md` documents admin-managed OAuth client registration but not tenant
  ownership or tenant policy.
- Plans 012-015 create the foundations this design should depend on:
  consent-safe client metadata, admin audit events, real team assignment, and a
  tenant-scoped policy engine.

Current OAuth client schema excerpt:

```ts
// src/db/schema.ts:379-414
export const oauthClient = pgTable(
	"oauth_client",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id").unique(),
		clientSecret: text("client_secret"),
		name: text("name"),
		redirectURLs: text("redirect_u_r_ls"),
		metadata: text("metadata"),
		type: text("type"),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
```

Current Applications copy:

```tsx
// src/pages/Applications.tsx:578-595
<SettingsCard
	id="clients"
	title="Managed OAuth clients"
	description="OAuth clients owned by this admin account."
```

Current admin route shape:

```ts
// worker/app.ts:478-505
export async function handleAdminOAuthClients(
	request: Request,
	env: Env,
	services: WorkerServices,
) {
	if (request.method === "GET") {
		const result = await services.adminOAuth.list(context, pagination);
```

Repo conventions to match:

- Use pnpm only. Do not use npm or yarn.
- Bump `package.json` for the design/doc change if files change.
- Keep the design practical and implementation-ready. Avoid speculative product
  features beyond tenant-owned OAuth clients and tenant policy.
- Prefer obvious ownership: provider-owned, user-created/admin-managed, or
  organization-owned. Do not hide ownership inside opaque metadata if a column is
  the obvious model.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Better Auth OAuth API recon | `rg "adminCreateOAuthClient|oauth_client|clientId|userId" node_modules/better-auth node_modules/@better-auth -g "*.d.ts" -g "*.js"` | identify what the provider APIs can and cannot support |
| Verify docs-only or design changes | `pnpm test` | exit 0, all tests pass |
| Lint | `pnpm lint` | exit 0, no ESLint errors |
| Typecheck without build artifacts | `pnpm exec tsc -b --noEmit` | exit 0, no TypeScript errors |
| Production build | `pnpm run build` | exit 0; this may update `dist/` |

Even though this plan is design-focused, run the verification baseline after
editing repo files. The package version bump and docs import paths can still
catch drift.

## Scope

**In scope**:

- `package.json`
- `README.md`
- `docs/organization-owned-oauth-clients.md` (create; create `docs/` if needed)
- `plans/README.md`

**Recon-only inputs for the design**:

- `src/db/schema.ts`
- `src/pages/Applications.tsx`
- `src/pages/Organizations.tsx`
- `src/pages/Consent.tsx`
- `worker/app.ts`
- `worker/index.ts`
- `src/lib/oauth-scope-claims.ts`
- `src/lib/oauth-policy.ts` if plan 015 has landed
- Better Auth installed package types/source

**Out of scope for this plan**:

- Applying schema migrations.
- Implementing organization-owned OAuth client routes.
- Changing token, consent, or client registration behavior.
- Adding SCIM/SAML.
- Building a tenant policy admin UI.

## Design work to complete

Create `docs/organization-owned-oauth-clients.md` with these sections.

### 1. Problem statement and non-goals

State the problem in concrete terms:

- provider admins can manage clients today
- organizations need to own clients
- organization owners/admins need scoped management rights
- OAuth grants and consent need to show the owning organization
- client scope choices need tenant policy constraints

Explicit non-goals:

- no SCIM/SAML implementation
- no billing entitlements
- no marketplace or public app directory
- no multi-org client sharing in the first implementation unless a clear
  product requirement exists

### 2. Ownership model

Define the first-pass ownership model. The recommended model is:

- provider-owned seed clients from `OAUTH_CLIENTS`
- provider-admin managed clients with no `organizationId`
- organization-owned clients with `organizationId`
- `userId` remains creator/last operator metadata, not the only ownership field

Explain why `organizationId` should be a real nullable column on
`oauth_client`, not only JSON metadata:

- queryability for lists and policy
- foreign key integrity
- audit filtering
- clear migration path

If Better Auth's OAuth client API cannot preserve unknown columns, document the
adapter constraint and recommend the least surprising workaround. Do not decide
to fork Better Auth unless there is no cleaner extension point.

### 3. Role and permission policy

Define who can manage organization clients.

Recommended first pass:

- provider admins can manage every client
- organization owners/admins can list/create/update/rotate/disable clients for
  their organization
- organization members without admin/owner role cannot manage clients
- `skipConsent` is provider-admin only unless there is a documented tenant trust
  model
- dynamic registration remains provider-admin only until org registration policy
  is designed

Tie this to plan 015:

- client management permissions should eventually map to tenant-scoped policy
  strings such as `organization:<id>:oauth-client:create`
- OAuth claim permissions are outputs for downstream clients, not the only
  enforcement boundary for Passport's own admin APIs

### 4. Scope policy

Define how organization-owned clients are constrained.

The design should answer:

- which scopes are always allowed (`openid`, `profile`, `email`)
- whether custom scopes such as `organizations`, `teams`, and `permissions`
  require organization admin approval
- whether organization-owned clients may request data outside their owning org
- how consent copy explains tenant-scoped claims
- how tenant policy changes affect existing consents and refresh tokens

Recommended first pass:

- org-owned clients can request the same supported scopes as provider-managed
  clients, but consent metadata clearly shows the owning organization
- no silent scope expansion for existing grants
- token claim builders continue deriving claims from the resource owner's real
  memberships, not from the client's owner organization alone

### 5. API and route shape

Propose route boundaries.

Recommended shape:

- keep `/api/admin/oauth-clients` for provider-admin clients
- add `/api/organizations/:organizationId/oauth-clients` for org-owned clients
- add action routes under that organization path for update, rotate secret, and
  enable/disable
- keep secret material one-time only
- include `organizationId` in audit events

Document whether the Applications page should remain the single UI entry point
with an organization filter, or whether organization client management belongs
inside the Organizations page. Choose one recommendation and explain why.

### 6. Schema and migration sketch

Write an implementation-ready migration sketch without applying it:

- add nullable `organization_id` to `oauth_client`
- add index on `oauth_client.organization_id`
- add foreign key to `organization.id` with a deliberate delete behavior
- define how existing rows migrate (likely `organization_id = null`)
- define how seed clients remain provider-owned and outside the DB migration

Call out any Better Auth adapter risks discovered during recon.

### 7. Consent, audit, and UI integration

Tie the design to prerequisite plans:

- plan 012: consent metadata should show owning organization name/logo when
  present
- plan 013: create/update/rotate/disable events should include `organizationId`
- plan 014: team claims remain based on resource owner team membership
- plan 015: policy claims remain tenant-scoped

Add expected UI copy updates:

- Applications page should no longer say "owned by this admin account" for org
  clients
- organization client rows should show client id, org owner, status, and one-time
  secret handling

### 8. Implementation phases after design

End the document with a proposed follow-up implementation breakdown:

1. schema and service support
2. org client worker routes and tests
3. Applications/Organizations UI
4. consent metadata organization owner display
5. audit integration
6. docs and migration notes

Each phase should have a verification note and a rollback note.

## README update

Add a short "planned tenant ownership" note to README only if it does not imply
the feature already exists. Link to `docs/organization-owned-oauth-clients.md`.

Do not change endpoint docs to claim organization-owned clients are shipped.

## Version and status

- Bump the root `package.json` patch version.
- Update `plans/README.md` status for plan 016 when complete.

## STOP conditions

Stop and report if any of these occur:

- Better Auth's installed OAuth provider cannot support organization ownership
  without replacing the provider or forking package internals.
- The design would require changing token semantics before the policy contract
  from plan 015 exists.
- The design relies on JSON metadata where a first-class `organizationId`
  relation is clearly needed.
- The README update would make unshipped org-owned clients sound available.
- In-scope files have drifted so far that the current-state excerpts no longer
  describe the code.

## Done criteria

- `docs/organization-owned-oauth-clients.md` exists and answers every section in
  this plan.
- The design chooses a clear ownership model, route model, role policy, scope
  policy, migration sketch, and implementation phase order.
- README links to the design without claiming the feature has shipped.
- No schema or behavior changes are applied in this design plan.
- `pnpm test`, `pnpm lint`, `pnpm exec tsc -b --noEmit`, and
  `pnpm run build` pass.
- `plans/README.md` marks 016 as DONE after the design is complete.

## Maintenance notes

- This design should become the source material for later implementation plans.
  Keep it concrete enough that a future executor can build from it without
  rediscovering ownership and policy decisions.
- If a future product requirement needs multi-organization clients, write that
  as a new design section rather than bending the first-pass nullable
  `organizationId` model into shared ownership.
- Do not let tenant-owned clients weaken consent. Organization ownership changes
  who can manage a client; it does not remove the resource owner's approval
  boundary.
