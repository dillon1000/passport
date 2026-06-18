# Organization-Owned OAuth Clients

## Problem Statement

Passport currently treats managed OAuth clients as provider-admin assets. Admins
create and rotate clients from `/applications`, and trusted seed clients come
from `OAUTH_CLIENTS`. Enterprise deployments need a tenant ownership model:
organizations should own clients, organization owners/admins should manage those
clients, consent should show the owning tenant, and scope choices should fit the
tenant policy model.

Non-goals for the first implementation:

- SCIM or SAML provisioning.
- Billing or subscription entitlements.
- Public marketplace or app directory.
- Multi-organization client sharing unless a concrete product requirement is
  added later.

## Ownership Model

Use three explicit ownership classes:

- Provider-owned seed clients from `OAUTH_CLIENTS`.
- Provider-admin managed clients with no `organizationId`.
- Organization-owned clients with an `organizationId`.

`oauth_client.user_id` should remain creator or last-operator metadata. It
should not be the only ownership field. Add a nullable `organization_id` column
to `oauth_client` because ownership must be queryable for lists, audit filters,
tenant policy checks, and referential integrity. Storing this only in
`metadata` would make the common ownership query opaque and fragile.

Better Auth's OAuth client APIs are already described as supporting user or
organization-owned clients, but Passport's custom admin service currently uses
server-only admin endpoints for restricted fields. If those endpoints do not
preserve custom columns during create/update, the least surprising workaround is
to call the Better Auth endpoint first, then update Passport-owned
`organization_id` in the same service path and test that update path. Do not fork
Better Auth unless adapter behavior makes a first-class column impossible.

## Role And Permission Policy

First implementation rules:

- Provider admins can manage every client.
- Organization owners/admins can list, create, update, rotate, disable, and
  enable clients owned by their organization.
- Organization members without owner/admin role cannot manage OAuth clients.
- `skipConsent` stays provider-admin only until Passport has a documented tenant
  trust model.
- Dynamic client registration remains provider-admin only until org registration
  policy is separately designed.

Plan 015's policy format can represent future client-management permissions with
tenant-scoped strings such as
`organization:<id>:oauth-client:create`. Those OAuth policy claims are outputs
for downstream clients; Passport's own worker APIs must still enforce access
from the session and database.

## Scope Policy

Baseline OIDC scopes, including `openid`, `profile`, and `email`, remain
available. Organization-owned clients may request the same supported Passport
scopes as provider-managed clients at first, but consent must clearly show the
owning organization. Existing grants must not receive silent scope expansion.

Custom claims continue to derive from the resource owner's real memberships,
teams, and policy rows. A client's owner organization does not imply the user is
a member of that organization, and token builders must not filter or fabricate
claims solely from client ownership.

Tenant policy changes should affect newly issued tokens through the claim
builder. Existing consents keep their granted scope list until the user
reauthorizes or the consent is revoked.

## API And Route Shape

Keep the provider-admin surface:

- `GET/POST /api/admin/oauth-clients`
- `PATCH /api/admin/oauth-clients/:clientId`
- `POST /api/admin/oauth-clients/:clientId/rotate-secret`
- `POST /api/admin/oauth-clients/:clientId/disable`
- `POST /api/admin/oauth-clients/:clientId/enable`

Add an organization-owned surface:

- `GET/POST /api/organizations/:organizationId/oauth-clients`
- `PATCH /api/organizations/:organizationId/oauth-clients/:clientId`
- `POST /api/organizations/:organizationId/oauth-clients/:clientId/rotate-secret`
- `POST /api/organizations/:organizationId/oauth-clients/:clientId/disable`
- `POST /api/organizations/:organizationId/oauth-clients/:clientId/enable`

Secret material remains one-time only. Audit events for organization clients
must include `organizationId`.

Recommended UI: keep `/applications` as the single OAuth client workbench and
add an organization filter/owner column there. This preserves the current client
mental model and avoids burying OAuth client operations inside the broader
organization lifecycle page.

## Schema And Migration Sketch

Future migration:

```sql
ALTER TABLE "oauth_client" ADD COLUMN "organization_id" text;
ALTER TABLE "oauth_client"
  ADD CONSTRAINT "oauth_client_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
  ON DELETE SET NULL;
CREATE INDEX "oauthClient_organizationId_idx"
  ON "oauth_client" ("organization_id");
```

Existing rows migrate with `organization_id = null` and remain provider-admin
managed. Seed clients remain outside this database ownership model and are still
configured by `OAUTH_CLIENTS`.

Use `ON DELETE SET NULL` for the first pass. Deleting an organization should not
silently delete OAuth credentials without an explicit client cleanup workflow and
audit trail.

## Consent, Audit, And UI Integration

Prerequisites and integration points:

- Plan 012 metadata should add organization name/logo to consent display when
  `organizationId` is present.
- Plan 013 audit events should include `organizationId` on org-owned client
  create/update/rotate/disable/enable.
- Plan 014 team claims stay based on resource owner team membership.
- Plan 015 policy claims stay tenant-scoped and resource-owner derived.

Applications UI copy should stop saying clients are "owned by this admin
account" once org clients ship. Client rows should show client id, owner type,
organization owner when present, enabled/disabled state, public/confidential
state, scopes, and one-time secret handling.

## Implementation Phases

1. Schema and service support.
   Verification: migration snapshot only adds `organization_id` and index.
   Rollback: drop the nullable column and index before any org clients exist.

2. Organization client worker routes and tests.
   Verification: provider admins and organization owners/admins pass; members
   fail; secrets are one-time only.
   Rollback: remove route registration while leaving schema nullable.

3. Applications UI owner filter and organization owner column.
   Verification: provider clients and org clients render in one table without
   changing existing admin workflows.
   Rollback: hide org filter/column; routes remain usable for tests.

4. Consent metadata owner display.
   Verification: consent shows organization owner only from server metadata.
   Rollback: omit owner display while keeping client name/icon.

5. Audit integration.
   Verification: every org client mutation records `organizationId`.
   Rollback: block org mutation routes until audit insertion is restored.

6. Docs and migration notes.
   Verification: README describes shipped behavior only and links to migration
   notes.
   Rollback: revert docs without touching runtime behavior.
