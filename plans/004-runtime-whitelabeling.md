# Plan 004: Move branding into runtime configuration

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f7dcb84..HEAD -- src/lib/brand.ts src/index.css src/components/auth/brand-mark.tsx src/pages/SignIn.tsx src/pages/Consent.tsx src/components/auth/auth-shell.tsx worker/app.ts src/env.ts .dev.vars.example README.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `f7dcb84`, 2026-06-14

## Why this matters

The design document says Passport should be whitelabelable from one place, but today the brand identity is static TypeScript plus CSS variables. That is fine for a single deployment but awkward for operators who want to deploy the same code with different product names, logo URLs, and colors. Runtime branding gives operators a deployment-level control without asking them to edit React source.

## Current state

- `design.md` prioritizes neutral whitelabeling.
- `src/lib/brand.ts` hardcodes display values.
- `src/index.css` hardcodes default brand CSS variables.
- `src/components/auth/brand-mark.tsx` renders from `brand.logoSrc` or an abbreviation.

Design intent:

```md
// design.md:139-149
Principles, in priority order:

1. **Neutral & whitelabelable** — no hardcoded brand. Color comes from CSS
   variables; `--brand` (+ optionally `--primary`) and `src/lib/brand.ts`
   rebrand everything.
...
4. **Modular & extensible** — composition over boolean props; adding a page or
   provider is a one-line config change.
```

Current static brand:

```ts
// src/lib/brand.ts:20-25
export const brand: Brand = {
	name: "Passport",
	abbreviation: "PP",
	descriptor: "Identity provider",
	capabilities: ["OIDC", "PKCE", "JWKS"],
};
```

Current CSS tokens:

```css
// src/index.css:54-60
:root {
	--radius: 0.625rem;
	/* Whitelabel accent. Override --brand (and optionally --primary) to rebrand
	   the entire UI from one place. Defaults to an adaptive neutral that stays
	   visible in both light and dark mode. */
	--brand: oklch(0.235 0.012 264);
	--brand-foreground: oklch(0.985 0.001 264);
```

Current brand mark:

```tsx
// src/components/auth/brand-mark.tsx:9-30
export function BrandMark({ className }: { className?: string }) {
	if (brand.logoSrc) {
		return <img src={brand.logoSrc} alt="" className={cn("size-8 rounded-md object-cover", className)} />;
	}

	return (
		<span aria-hidden="true" className={cn("grid size-8 ... bg-brand ...", className)}>
			{brand.abbreviation}
		</span>
	);
}
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
- `src/lib/brand.ts`
- `src/components/auth/brand-mark.tsx`
- `src/pages/SignIn.tsx`
- `src/pages/Consent.tsx`
- `src/components/auth/auth-shell.tsx` if it renders brand copy
- `worker/app.ts`
- `src/env.ts`
- `.dev.vars.example`
- `README.md`
- New small `src/lib/brand-context.tsx` or similar

**Out of scope**:
- Do not implement per-tenant database-backed branding.
- Do not add a branding editor UI.
- Do not change auth protocol behavior.
- Do not remove the default Passport brand fallback.

## Git workflow

- Branch: `branch/004-runtime-whitelabeling`
- Commit message style: simple imperative.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define public brand config

Add a public brand config type that allows these fields:

```ts
type PublicBrandConfig = {
	name: string;
	abbreviation: string;
	descriptor: string;
	logoSrc?: string;
	capabilities: string[];
	theme?: {
		brand?: string;
		brandForeground?: string;
		primary?: string;
		primaryForeground?: string;
		ring?: string;
	};
};
```

Keep the current Passport values as defaults. Add env vars in `src/env.ts` and `.dev.vars.example`:

- `BRAND_NAME`
- `BRAND_ABBREVIATION`
- `BRAND_DESCRIPTOR`
- `BRAND_LOGO_SRC`
- `BRAND_CAPABILITIES`
- `BRAND_COLOR`
- `BRAND_FOREGROUND_COLOR`
- `PRIMARY_COLOR`
- `PRIMARY_FOREGROUND_COLOR`
- `RING_COLOR`

Use CSV parsing for capabilities. Validate colors conservatively: accept empty values or CSS color strings that do not contain `;`, `{`, or `}`. This endpoint is public, so never expose secrets.

**Verify**: `pnpm lint` exits 0.

### Step 2: Add a public brand-config endpoint

In `worker/app.ts`, add `GET /api/brand-config` before auth/static routing. Return the public config as JSON with cache headers appropriate for a deployment-level config:

```http
cache-control: public, max-age=60
```

Keep this route unauthenticated because sign-in and consent pages need it before a session exists.

Add tests in `worker/app.test.ts`:

- default config returns Passport defaults when env vars are absent
- configured env values override defaults
- no secret env vars are present in the JSON

**Verify**: `pnpm test -- worker/app.test.ts` exits 0.

### Step 3: Load branding before rendering the React app

Add a small brand provider or loader. The app should:

- render immediately with default Passport values
- fetch `/api/brand-config`
- apply received text values to brand context
- apply theme values by setting CSS custom properties on `document.documentElement`
- keep working if the fetch fails

Update `src/lib/brand.ts` so existing imports can either continue using defaults or move to a hook such as `useBrand()`. Update `SignIn`, `Consent`, `BrandMark`, and any shell/footer copy to use the runtime brand value.

**Verify**: `pnpm lint` exits 0.

### Step 4: Document deployment usage

Update README with:

- default Passport branding
- env vars for branding
- warning that branding config is public
- example `.dev.vars` snippet with non-secret branding values
- note that CSS color values should be complete CSS colors such as `oklch(...)`, `#111827`, or `rgb(...)`

**Verify**: `pnpm run build` exits 0.

### Step 5: Run full verification

**Verify**:

- `pnpm test` exits 0
- `pnpm lint` exits 0
- `pnpm run build` exits 0

## Test plan

- Extend `worker/app.test.ts` for `/api/brand-config`.
- There is no UI test harness in this repo; rely on lint/build unless one exists after drift.
- If you add pure helper functions for sanitizing/applying brand values, add focused Vitest tests for them.

## Done criteria

- [ ] `/api/brand-config` returns default Passport values without env overrides.
- [ ] Runtime env vars can change name, abbreviation, descriptor, logo URL, capabilities, and core brand colors.
- [ ] Sign-in, consent, shell, and brand mark use runtime brand values after config loads.
- [ ] The UI still renders with defaults if `/api/brand-config` fails.
- [ ] README and `.dev.vars.example` document the public branding vars.
- [ ] `pnpm test`, `pnpm lint`, and `pnpm run build` exit 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- The implementation would require embedding secrets or private config in the public brand endpoint.
- Runtime branding requires a full page reload for every route change.
- Applying theme values introduces unsafe style injection beyond CSS custom property values.
- The app cannot render a default brand before the async fetch completes.

## Maintenance notes

This plan intentionally keeps branding deployment-scoped. If Passport later becomes multi-tenant, replace the env-backed endpoint with host/client-aware lookup, but keep the same public JSON shape if possible.

