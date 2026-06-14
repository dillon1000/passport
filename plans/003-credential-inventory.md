# Plan 003: Complete credential inventory and removal

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f7dcb84..HEAD -- src/pages/Security.tsx src/auth.ts src/auth-client.ts src/db/schema.ts worker/app.ts worker/index.ts worker/app.test.ts src/components/auth/social-buttons.tsx`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `f7dcb84`, 2026-06-14

## Why this matters

The Security page lets users add sign-in methods, but it does not let them audit or remove all of them. For an identity provider, users need to know which passkeys and social accounts can access the account, and they need removal controls when a device or provider account is no longer trusted. The database already stores passkeys and linked provider accounts.

## Current state

- `src/pages/Security.tsx` can add a passkey but does not list existing passkeys.
- `src/auth.ts` enables account linking for GitHub, Discord, and X.
- `src/components/auth/social-buttons.tsx` lists the configured providers.
- `src/db/schema.ts` has `passkey` and `account` tables.

Current passkey UI:

```tsx
// src/pages/Security.tsx:61-71
async function addPasskey(event: FormEvent<HTMLFormElement>) {
	event.preventDefault();
	setStatus(null);
	setBusy(true);
	const result = await authClient.passkey.addPasskey({ name: passkeyName || undefined });
	setBusy(false);
	setStatus(
		result?.error
			? { tone: "error", message: result.error.message ?? "Could not add passkey." }
			: { tone: "success", message: "Passkey added to this account." },
	);
}
```

```tsx
// src/pages/Security.tsx:195-217
<section id="passkeys" className="scroll-mt-32">
	<form onSubmit={addPasskey}>
		<SettingsCard
			title="Passkeys"
			description="Add a named passkey for phishing-resistant, passwordless sign-in on this device."
			...
		>
			<Field label="Passkey name">
				<FieldInput ... value={passkeyName} onChange={(event) => setPasskeyName(event.target.value)} />
			</Field>
		</SettingsCard>
	</form>
</section>
```

Account linking config:

```ts
// src/auth.ts:81-86
account: {
	accountLinking: {
		enabled: true,
		trustedProviders: ["github", "discord", "twitter"],
	},
},
```

Social provider list:

```ts
// src/components/auth/social-buttons.tsx:38-42
const providers: SocialProvider[] = [
	{ id: "github", label: "GitHub", Icon: GitHubIcon },
	{ id: "discord", label: "Discord", Icon: DiscordIcon },
	{ id: "twitter", label: "X", Icon: XIcon },
];
```

Schema excerpt:

```ts
// src/db/schema.ts:48-70
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    ...
```

```ts
// src/db/schema.ts:96-116
export const passkey = pgTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at"),
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Focused tests | `pnpm test -- worker/app.test.ts` | exit 0 |
| Full tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Build/typecheck | `pnpm run build` | exit 0 |

## Scope

**In scope**:
- `src/pages/Security.tsx`
- `src/auth-client.ts`
- `worker/app.ts`
- `worker/index.ts`
- `worker/app.test.ts`
- New small helper files under `src/lib/` or `worker/`

**Out of scope**:
- Do not change generated `src/db/schema.ts`.
- Do not change provider credentials, social sign-in setup, or OAuth scopes.
- Do not remove the ability to add passkeys.
- Do not implement MFA policy enforcement in this plan.

## Git workflow

- Branch: `branch/003-credential-inventory`
- Commit message style: simple imperative.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Prefer official Better Auth credential APIs

Inspect installed Better Auth client/server APIs for:

- listing passkeys
- deleting/removing a passkey
- listing linked accounts
- unlinking a social/provider account

Use official APIs if present. If official APIs are missing for listing only, add read-only Worker endpoints that query the generated tables. If official APIs are missing for deletion/unlinking, stop before implementing direct deletion; provider account removal can affect auth invariants.

**Verify**: Record the exact official methods used in code or stop if deletion would require unsupported direct table mutation.

### Step 2: Add safe read APIs if needed

If needed, add authenticated endpoints:

- `GET /api/security/passkeys`
- `GET /api/security/linked-accounts`

Response fields must be safe:

```ts
type PasskeySummary = {
	id: string;
	name?: string | null;
	deviceType: string;
	backedUp: boolean;
	transports?: string | null;
	createdAt?: string | null;
};

type LinkedAccountSummary = {
	id: string;
	providerId: "github" | "discord" | "twitter" | string;
	accountId: string;
	createdAt?: string | null;
};
```

Never return public keys, access tokens, refresh tokens, ID tokens, passwords, or provider tokens.

**Verify**: `pnpm test -- worker/app.test.ts` exits 0 with authenticated/unauthenticated tests and redaction assertions.

### Step 3: Add removal flows

Use official Better Auth APIs for:

- removing a passkey by ID
- unlinking a provider account by account/provider ID

If an official API requires recent authentication or password confirmation, surface that requirement in the UI instead of bypassing it.

Add confirmation dialogs for destructive actions. Disable deletion of the last usable sign-in method if Better Auth does not already prevent it. A "usable sign-in method" means password account, verified social account, or passkey.

**Verify**: `pnpm test -- worker/app.test.ts` exits 0 if Worker endpoints changed.

### Step 4: Update Security UI

In `src/pages/Security.tsx`:

- load existing passkeys when a user session is present
- show passkey name, created date if present, device type, backup status, and transports
- refresh the list after adding a passkey
- add a remove button with confirmation for each passkey
- add a "Connected accounts" section listing GitHub, Discord, and X status
- allow linking missing providers through `authClient.signIn.social` or the official link-account API
- allow unlinking connected providers through the official API

Keep the page's current `SettingsCard` and section-nav style. Add a new section id such as `accounts` if needed and update `SECTIONS`.

**Verify**: `pnpm lint` exits 0.

### Step 5: Run full verification

**Verify**:

- `pnpm test` exits 0
- `pnpm lint` exits 0
- `pnpm run build` exits 0

## Test plan

- Add Worker tests only for custom security endpoints you add.
- If all operations use official Better Auth client methods directly, rely on `pnpm lint` and `pnpm run build` for UI integration because there is no UI test harness in this repo.
- Test redaction explicitly if querying `account` or `passkey` tables.

## Done criteria

- [ ] Users can see existing passkeys.
- [ ] Users can remove passkeys through a supported API.
- [ ] Users can see linked GitHub, Discord, and X accounts.
- [ ] Users can link and unlink social accounts through supported APIs.
- [ ] No credential material, tokens, public keys, or secrets are returned to the browser.
- [ ] `pnpm test`, `pnpm lint`, and `pnpm run build` exit 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- Better Auth has no supported delete/unlink APIs for the operation you need.
- Removing a credential would require direct deletion from generated auth tables without documented support.
- You cannot prevent users from removing their last usable sign-in method.
- You discover linked accounts are provider identities required for existing sessions in a way this plan does not cover.

## Maintenance notes

Reviewers should inspect redaction and last-credential protection. This plan intentionally does not introduce MFA policy, recovery codes, or organization-level security requirements.

