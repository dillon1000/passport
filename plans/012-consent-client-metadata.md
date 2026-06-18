# Plan 012: Show registered OAuth client metadata on consent

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dcbfe34..HEAD -- package.json src/pages/Consent.tsx worker/app.ts worker/index.ts worker/app.test.ts src/lib/oauth-client-metadata.ts src/lib/oauth-client-metadata.test.ts plans/README.md`
> and `git diff --stat -- package.json src/pages/Consent.tsx worker/app.ts worker/index.ts worker/app.test.ts src/lib/oauth-client-metadata.ts src/lib/oauth-client-metadata.test.ts plans/README.md`.
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: 011
- **Category**: direction
- **Planned at**: commit `dcbfe34`, 2026-06-16

## Why this matters

The consent screen is the last human checkpoint before Passport grants an OAuth
client access to identity data. Today it displays the raw `client_id` from the
authorization URL and derives an icon from the first two characters of that
string. That is technically correct but operationally weak: users cannot tell
whether they are approving "Acme Support Console" or an opaque identifier, and
the page does not use the metadata admins already manage for registered OAuth
clients.

This plan makes consent use server-resolved, redacted client metadata. The
server must treat the query-string `client_id` only as a lookup key. Names,
icons, URIs, and policy links must come from Passport's registered client data,
never from OAuth authorize query parameters.

## Current state

- `src/pages/Consent.tsx` reads `client_id` and `scope` directly from
  `window.location.search`.
- The consent UI renders `BrandMark` beside a two-letter fallback derived from
  `clientId.slice(0, 2)`.
- `src/pages/Applications.tsx` already captures registered client metadata:
  `name`, `uri`, `icon`, `tos`, `policy`, `redirectUris`,
  `postLogoutRedirectUris`, `public`, `disabled`, and `skipConsent`.
- `worker/index.ts` already knows how to redact OAuth client secrets for admin
  lists.
- `worker/app.ts` has authenticated worker routes for applications and admin
  OAuth client management, but no consent-safe client metadata route.
- `src/lib/oauth-scopes.ts` is the source of consent scope copy after plan 011.

Relevant consent excerpt:

```tsx
// src/pages/Consent.tsx:62-70
const query = new URLSearchParams(window.location.search);
const clientId = query.get("client_id") ?? "Unknown app";
const scopes = (query.get("scope") ?? "")
	.split(" ")
	.map((scope) => scope.trim())
	.filter(Boolean);
```

```tsx
// src/pages/Consent.tsx:118-136
<BrandMark className="size-14 text-base" />
<div className="grid size-14 place-items-center rounded-2xl border border-border bg-secondary text-sm font-semibold text-foreground shadow-sm">
	{clientId.slice(0, 2).toUpperCase()}
</div>
...
<CardTitle>{clientId} wants access to your Passport account</CardTitle>
```

Worker client summary already contains the metadata needed for display:

```ts
// worker/app.ts:69-83
export type OAuthClientSummary = {
	clientId: string;
	name: string;
	redirectUris: string[];
	postLogoutRedirectUris: string[];
	scopes: string[];
	uri?: string;
	icon?: string;
	tos?: string;
	policy?: string;
	public?: boolean;
	disabled?: boolean;
	skipConsent?: boolean;
	enableEndSession?: boolean;
	clientSecret?: string;
};
```

Repo conventions to match:

- Use pnpm only. Do not use npm or yarn.
- Bump `package.json` for the implementation change.
- Add concise file-level notes to new or meaningfully changed implementation
  files.
- Keep the UI aligned with `design.md`: neutral auth card, compact copy, no
  decorative imagery, no marketing language.
- Do not expose `clientSecret` or any other credential through the new route.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Targeted tests | `pnpm test -- src/lib/oauth-client-metadata.test.ts worker/app.test.ts` | exit 0, new metadata tests pass |
| Full tests | `pnpm test` | exit 0, all tests pass |
| Lint | `pnpm lint` | exit 0, no ESLint errors |
| Typecheck without build artifacts | `pnpm exec tsc -b --noEmit` | exit 0, no TypeScript errors |
| Production build | `pnpm run build` | exit 0; this may update `dist/` |

If the targeted test file does not exist yet, create it before running the
targeted command.

## Scope

**In scope**:

- `package.json`
- `src/lib/oauth-client-metadata.ts` (create if useful)
- `src/lib/oauth-client-metadata.test.ts` (create if useful)
- `src/pages/Consent.tsx`
- `worker/app.ts`
- `worker/index.ts`
- `worker/app.test.ts`
- `plans/README.md`

**Out of scope**:

- Database schema or migrations.
- Changing OAuth authorization, token issuance, consent acceptance, or consent
  revocation semantics.
- Showing client secrets, seed secrets, or any credential material.
- Trusting display metadata supplied by the OAuth authorize URL.
- Reworking the Applications page beyond type reuse needed for this endpoint.

## Implementation steps

### 1. Add a redacted metadata contract

Create a small server-facing type for consent display. Keep it narrower than
`OAuthClientSummary`:

- `clientId`
- `name`
- `uri`
- `icon`
- `tos`
- `policy`
- `redirectUris` if useful for tests or future display
- `public`
- `disabled`
- `source` as `"database" | "seed"` if that helps distinguish test cases

Do not include:

- `clientSecret`
- raw database row metadata that is not displayed
- admin-only fields not needed by consent

If you create `src/lib/oauth-client-metadata.ts`, put a file-level note at the
top explaining that it normalizes registered OAuth client metadata for consent
display and intentionally redacts credentials.

### 2. Resolve metadata on the server

Add a worker service method and route for consent-safe client metadata. Suggested
route:

```txt
GET /api/oauth/client-metadata?clientId=<id>
```

Use the same session/auth boundary as other dashboard routes. If the consent
page can render before a session exists, return `401` and let the page fall back
to a neutral pending/unknown state until Better Auth redirects the user.

Resolution rules:

1. Trim and require `clientId`.
2. Look up database-backed OAuth clients first.
3. Fall back to `OAUTH_CLIENTS` trusted seed clients from `src/env.ts`.
4. Return `404` for unknown clients.
5. Return redacted metadata only.
6. Include disabled status so the UI can warn instead of presenting a normal
   approval surface if a disabled client reaches the page.

Reuse existing mapper/redaction logic from `worker/index.ts` where possible.
If existing Better Auth APIs only return secret-bearing shapes, map immediately
to the narrow consent contract before returning any data from the service.

### 3. Update the consent UI

In `src/pages/Consent.tsx`:

- Keep reading `client_id` and `scope` from the OAuth URL, because those are
  still the provider inputs.
- Fetch server metadata for `client_id` after mount.
- Render the registered `name` as the primary application label when available.
- Render `clientId` as a mono secondary identifier, not the headline.
- Render `icon` when available and valid enough for an `img` `src`; otherwise
  keep a deterministic initials fallback from the registered name, then
  `clientId`.
- Render `uri`, `tos`, and `policy` as compact external links when present.
- Show a muted "Unknown registered application" state for a 404. Do not accept
  a name from the query string as a fallback.
- If `disabled` is true, disable the approval button and explain that the
  application is disabled. The deny button should remain available.
- Preserve the current submit behavior: `oauthConsentRequestBody` and
  `OAUTH_CONSENT_ENDPOINT` remain the authority for accept/deny.

Keep the auth-card layout compact. Do not add explanatory feature text or a
marketing section.

### 4. Add tests

Add worker tests for:

- non-session users cannot read metadata
- missing `clientId` returns `400`
- unknown clients return `404`
- database-backed clients return name, icon, URI, policy, and no secret
- seed clients return name and no secret
- disabled clients include `disabled: true`

Add unit tests for metadata normalization if you create a helper file.

If you can test the consent display without adding a new test dependency, cover:

- registered name replaces raw `client_id` in the headline
- unknown clients do not render query-supplied display data
- disabled clients disable the approval action

Do not add a UI testing dependency only for this plan unless the repo already
has one by the time you execute it.

### 5. Update docs and version

- Bump the root `package.json` patch version.
- Update `plans/README.md` status for plan 012 when complete.
- If README consent behavior is documented by then, add one sentence stating
  that the consent page displays registered OAuth client metadata and never
  exposes secrets.

## STOP conditions

Stop and report if any of these occur:

- The only available client metadata source includes secrets and cannot be
  safely redacted before the route boundary.
- The implementation would require trusting `client_name`, `logo_uri`, or any
  other display field from the authorize query string.
- Better Auth's consent flow rejects the page fetch/session pattern and there is
  no authenticated way to fetch metadata before consent.
- Disabled clients cannot be identified reliably but the UI would present them
  as active.
- In-scope files have drifted so far that the current-state excerpts no longer
  describe the code.

## Done criteria

- Consent displays registered OAuth client names, icons, and policy links when
  present.
- Unknown clients are visibly unknown and do not use query-supplied display
  data.
- Disabled clients cannot be approved from the UI.
- The new metadata route is authenticated, tested, and returns no secrets.
- `pnpm test`, `pnpm lint`, `pnpm exec tsc -b --noEmit`, and
  `pnpm run build` pass.
- `plans/README.md` marks 012 as DONE after implementation.

## Maintenance notes

- Keep consent display metadata separate from OAuth authorization decisions.
  The OAuth provider remains responsible for validating clients and issuing
  grants.
- If organization-owned clients are added later, extend the metadata contract
  with redacted organization display fields instead of adding another consent
  fetch path.
- If client logo proxying or validation becomes necessary, add it behind the
  metadata contract so the page does not learn storage details.
