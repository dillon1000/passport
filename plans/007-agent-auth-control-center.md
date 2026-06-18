# Plan 007: Turn Agent Auth into a control center

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dcbfe34..HEAD -- src/auth.ts src/auth-client.ts src/pages/Agents.tsx src/pages/AgentApprove.tsx src/db/schema.ts src/routes.test.tsx package.json plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED-HIGH
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `dcbfe34`, 2026-06-15

## Why this matters

Passport already ships Agent Auth discovery, capability listing, registered
agent listing, host listing, and a raw approval page. That is enough to prove
the plugin is wired, but it is not yet an operator-grade trust surface. Users
can see agents and hosts, but they cannot revoke stale trust, reactivate an
expired agent, inspect pending approvals in context, or revoke individual
capability grants from the dashboard.

The installed `@better-auth/agent-auth` package already exposes the lifecycle
endpoints needed for a first control center. Use those first-class APIs instead
of adding custom database mutations.

## Current state

- `src/auth.ts` defines exactly one public capability:
  `get_service_metadata`.
- `src/auth.ts` configures `agentAuth(...)` with delegated and autonomous
  modes, `/agent/approve` as the device authorization page, and
  `defaultHostCapabilities: [SERVICE_METADATA_CAPABILITY]`.
- `src/pages/Agents.tsx` fetches discovery, capability, agent, and host lists,
  then renders them as read-only rows.
- `src/pages/AgentApprove.tsx` asks the user to type raw `agent_id`,
  `approval_id`, `user_code`, and `capabilities` values, then calls
  `approveCapability` through a local `unknown` cast.
- `src/db/schema.ts` already contains Agent Auth tables for hosts, agents,
  capability grants, approval requests, keys, events, and execution events.
- `src/auth-client.ts` installs `agentAuthClient()`, so the browser should use
  Better Auth client methods before falling back to raw `fetch`.

Existing capability definition:

```ts
// src/auth.ts:138-162
const SERVICE_METADATA_CAPABILITY = "get_service_metadata";
const agentCapabilities = [
	{
		name: SERVICE_METADATA_CAPABILITY,
		description: "Read public metadata about this Passport identity provider.",
		input: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
		output: {
			type: "object",
			properties: {
				name: { type: "string" },
				issuer: { type: "string" },
				capabilities: {
					type: "array",
					items: { type: "string" },
				},
			},
			required: ["name", "issuer", "capabilities"],
		},
		approvalStrength: "none",
	},
] satisfies Capability[];
```

Agent Auth plugin registration:

```ts
// src/auth.ts:311-335
agentAuth({
	providerName: agentProviderName(env),
	providerDescription: agentProviderDescription(env),
	modes: ["delegated", "autonomous"],
	deviceAuthorizationPage: "/agent/approve",
	capabilities: agentCapabilities,
	defaultHostCapabilities: [SERVICE_METADATA_CAPABILITY],
	validateCapabilities: (capabilities) =>
		capabilities.every((capability) =>
			agentCapabilities.some((known) => known.name === capability),
		),
	onExecute: async ({ capability, agentSession }) => {
		if (capability !== SERVICE_METADATA_CAPABILITY) {
			throw new Error(`Unsupported capability: ${capability}`);
		}
		return {
			name: agentProviderName(env),
			issuer: env.BETTER_AUTH_URL,
			capabilities: splitCsv(env.BRAND_CAPABILITIES).length
				? splitCsv(env.BRAND_CAPABILITIES)
				: ["OIDC", "PKCE", "JWKS"],
			agentId: agentSession.agentId,
		};
	},
}),
```

Current list loading:

```tsx
// src/pages/Agents.tsx:105-121
const [configurationPayload, capabilityPayload, agentPayload, hostPayload] =
	await Promise.all([
		fetch("/.well-known/agent-configuration").then(readJSON<AgentConfiguration>),
		fetch("/api/auth/capability/list").then(
			readJSON<{ capabilities: AgentCapability[] }>,
		),
		fetch("/api/auth/agent/list").then(readJSON<{ agents: AgentSummary[] }>),
		fetch("/api/auth/host/list").then(readJSON<{ hosts: HostSummary[] }>),
	]);
setConfiguration(configurationPayload);
setCapabilities(capabilityPayload.capabilities);
setAgents(agentPayload.agents);
setHosts(hostPayload.hosts);
```

Current approval call:

```tsx
// src/pages/AgentApprove.tsx:51-62
const agentClient = authClient as unknown as AgentApprovalClient;
const result = await agentClient.agent.approveCapability({
	agent_id: agentId || undefined,
	approval_id: approvalId || undefined,
	user_code: userCode || undefined,
	action,
	capabilities: capabilityList(capabilities),
	reason: reason || undefined,
});
```

Installed API evidence:

```ts
// node_modules/@better-auth/agent-auth/dist/client.d.ts
pathMethods: {
	"/agent-configuration": "GET";
	"/capability/list": "GET";
	"/capability/describe": "GET";
	"/agent/list": "GET";
	"/agent/get": "GET";
	"/agent/status": "GET";
	"/agent/session": "GET";
	"/host/list": "GET";
	"/host/get": "GET";
	"/agent/ciba/pending": "GET";
	"/agent/register": "POST";
	"/agent/update": "POST";
	"/agent/revoke": "POST";
	"/agent/rotate-key": "POST";
	"/agent/reactivate": "POST";
	"/agent/request-capability": "POST";
	"/agent/approve-capability": "POST";
	"/agent/grant-capability": "POST";
	"/agent/revoke-capability": "POST";
	"/host/create": "POST";
	"/host/revoke": "POST";
	"/host/update": "POST";
	"/host/rotate-key": "POST";
}
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Read design system | `sed -n '1,240p' design.md` | Confirms dashboard UI conventions before changing pages |
| API recon | `rg -n '"/agent/revoke"|"/agent/reactivate"|"/agent/revoke-capability"|"/host/revoke"|"/agent/ciba/pending"|approveCapability|grantCapability|revokeCapability' node_modules/@better-auth/agent-auth -g '*.d.ts' -g '*.js' -g 'README.md'` | Confirms method names and endpoint support |
| Install | `pnpm install` | exit 0 |
| Focused route tests | `pnpm test -- src/routes.test.tsx` | exit 0 if route/nav behavior changes; otherwise no route changes needed |
| Focused agent tests | `pnpm test -- src/lib/agent-auth.test.ts` | exit 0 if helper module is added |
| Full tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm run build` | exit 0 |

## Scope

**In scope**:
- `src/pages/Agents.tsx`
- `src/pages/AgentApprove.tsx`
- `src/auth.ts` only if a small, safe capability metadata adjustment is needed
- `src/lib/agent-auth.ts` and `src/lib/agent-auth.test.ts` if typed helpers
  keep the UI obvious
- `src/routes.test.tsx` only if routes or dashboard nav expectations change
- `package.json` for the required patch version bump
- `plans/README.md` status update when done

**Out of scope**:
- Direct database writes to Agent Auth tables.
- Custom worker endpoints that duplicate Agent Auth plugin endpoints.
- Adding destructive agent capabilities such as deleting accounts, rotating
  user secrets, changing passwords, or mutating OAuth clients.
- A broad "import any OpenAPI operation as a capability" system.
- Exposing all user or account data to agents.
- Generated schema/migration changes unless the installed Agent Auth package
  requires them and the executor can prove the existing schema is stale.
- Deployment or GitHub push.

## Git workflow

- Branch: `feature/agent-auth-control-center`
- Commit message style: short imperative summary, for example
  `Add Agent Auth control center actions`
- Do not push unless the operator explicitly asks.
- Do not add co-authors.

## Steps

### Step 1: Confirm the installed Agent Auth API shape

Before touching app code, inspect the package files that define the browser
client methods and endpoint request shapes. Start with:

```sh
rg -n 'agentAuthClient|approveCapability|grantCapability|revokeCapability|reactivate|revoke' node_modules/@better-auth/agent-auth
```

Then inspect the relevant declaration and implementation chunks. Confirm:

- The method names exposed by `agentAuthClient()`.
- Whether `authClient.agent.revoke`, `authClient.agent.reactivate`,
  `authClient.agent.revokeCapability`, and `authClient.host.revoke` are
  available as typed client methods.
- The required body keys for each mutation.
- Whether `/agent/ciba/pending` returns the pending request data needed to
  improve `/agent/approve`.

Do not infer body shapes from endpoint names. If the package declaration is too
loose to provide request bodies, inspect the compiled implementation in
`node_modules/@better-auth/agent-auth/dist`.

STOP if you cannot verify the mutation request shapes. Report the exact package
files that were inconclusive.

### Step 2: Centralize the Agent Auth browser facade

If the Better Auth client methods are awkward to type in page components, add
`src/lib/agent-auth.ts` with a narrow facade. The purpose of this file is to
centralize any unavoidable type bridging and to keep page code clear.

Suggested shape:

```ts
// src/lib/agent-auth.ts
import { authClient } from "../auth-client";

type AgentAuthActionResult = {
	error?: { message?: string } | null;
};

export async function revokeAgent(agentId: string): Promise<AgentAuthActionResult> {
	// Call the verified Better Auth client method here.
}
```

Keep any `unknown` cast in this helper only, and document why the cast exists:
the installed plugin extends the generated Better Auth client at runtime but the
local inferred type may not expose every plugin method. Do not scatter casts
across `Agents.tsx` and `AgentApprove.tsx`.

Add helper tests only for deterministic local behavior: capability string
parsing, request payload normalization, and result-to-status helpers. Do not
mock the whole Better Auth client unless the local test pattern already makes
that simple.

STOP if the facade would become a large parallel client. Use direct official
client methods in the page instead.

### Step 3: Add explicit trust actions to `Agents`

Update `src/pages/Agents.tsx` so the list is not read-only.

For registered agents:

- Add a revoke action for active or pending agents.
- Add a reactivate action only for expired agents if the installed API supports
  it and the status values can be verified.
- Add per-capability revoke actions for existing grants when a grant is active
  or pending.
- Refresh the lists after a successful action.
- Show a success or error `StatusBanner` message for every mutation.

For hosts:

- Add a revoke action for active hosts.
- Refresh the lists after success.
- Do not add host creation, enrollment token creation, host key rotation, or
  host switching in this pass.

Implementation details:

- Use existing `SettingsCard`, `SettingsCardFooter`, `Badge`, `Button`,
  `StatusBanner`, and Lucide icon patterns.
- Keep destructive buttons small, explicit, and placed on the row they affect.
- Disable only the row/action that is currently busy. Do not block the whole
  page unless the initial reload is in progress.
- Preserve stable row layout. Action buttons should not cause long IDs,
  capability chips, or status badges to overlap on mobile.
- Do not add a modal unless the existing component set already has one and the
  row action needs confirmation. A simple inline confirm state is acceptable
  for revoke actions if it keeps the page obvious.

STOP if the action requires admin privileges or a host secret not available to
the signed-in user. Report that the API supports the operation but the current
session cannot safely call it.

### Step 4: Improve `AgentApprove` so users approve context, not raw IDs

Keep `/agent/approve` as the approval page, but make it less of a debugging
form.

Required behavior:

- Continue supporting existing query params: `agent_id`, `approval_id`,
  `user_code`, and `capabilities`.
- If the package exposes a pending approval lookup, load pending approval
  details from `approval_id` or `user_code`.
- Render the agent name/host, requested capabilities, approval strength, and
  requested reason when available.
- Keep manual ID fields as a fallback for unsupported pending lookups, but do
  not make raw IDs the primary visual experience when richer context exists.
- Use the centralized Agent Auth facade or official client method for
  `approveCapability`.
- Keep approve and deny paths symmetrical: both set busy state, both surface
  errors, and both clear busy state in `finally`.

Do not add a new route. Do not require the user to be an admin. Agent approval
is a user trust decision for the signed-in user unless product requirements say
otherwise.

STOP if `/agent/ciba/pending` or the equivalent pending lookup only works for
server-side host sessions. In that case, keep the raw form but still centralize
the approve call and improve error/busy handling.

### Step 5: Leave executable capability expansion intentionally narrow

This pass is about trust controls, not broad agent powers.

Only change `src/auth.ts` if one of these is true:

- The UI needs a small metadata field in `get_service_metadata` to explain the
  new control center.
- Package API recon proves that a capability description field is missing or
  malformed in the current configuration.

If adding a new capability is still desired after the lifecycle controls land,
write a follow-up plan instead of squeezing it into this implementation. A safe
candidate is a read-only account security summary with no secrets and no PII
beyond data the signed-in user already sees, but that needs its own data-source
review.

### Step 6: Add tests, bump the version, and verify

Follow repo rules:

- Use `pnpm` only.
- Bump `package.json` patch version for this change.
- Do not run `pnpm deploy`; deploy is reserved and Cloudflare deploys must use
  `pnpm run deploy` only when explicitly requested.

Testing expectations:

- Add or update route/nav tests only if route/nav behavior changes.
- Add helper tests if `src/lib/agent-auth.ts` contains parsing or status
  normalization.
- If the UI uses fetch wrappers for mutations, add focused tests around the
  payload helper rather than brittle DOM tests unless a local page-test pattern
  already exists.

Run:

```sh
pnpm test
pnpm lint
pnpm run build
```

Then update the Plan 007 row in `plans/README.md` to `DONE` with no unrelated
README rewrites.

## Done criteria

- `Agents` lets a signed-in user revoke stale agents, revoke hosts, revoke
  capability grants, and reactivate expired agents when supported by the
  installed API.
- `AgentApprove` still works with existing query params and presents richer
  approval context when the installed API exposes it.
- Any Agent Auth client type bridging is centralized and documented.
- No direct DB mutation path was added.
- No broad new executable agent powers were added.
- `package.json` patch version was bumped by the executor.
- `pnpm test`, `pnpm lint`, and `pnpm run build` all pass.
- `plans/README.md` marks Plan 007 as `DONE`.

## STOP conditions

- Installed Agent Auth request shapes cannot be verified from the package.
- Required lifecycle operations are not user-callable with the current session.
- The implementation needs direct writes to Agent Auth tables.
- The implementation starts adding broad account-mutating capabilities.
- The control center requires an admin policy decision that is not already in
  the repo.
- In-scope files drift from the excerpts above and the correct merge behavior
  is ambiguous.
