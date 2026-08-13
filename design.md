---
version: 1.0.0
name: Passport
description: >-
  Neutral, utilitarian, whitelabelable identity-provider UI. Vercel-grade
  dashboard aesthetic — cool-gray palette, Geist type, restraint over
  decoration. Every brand-specific value is driven by CSS variables so a tenant
  rebrands from one place. Values below are the light theme; see "## Colors" for
  the dark overrides applied under the `.dark` class.
colors:
  background: "oklch(0.99 0.0015 264)"
  foreground: "oklch(0.21 0.012 264)"
  card: "oklch(1 0 0)"
  cardForeground: "oklch(0.21 0.012 264)"
  popover: "oklch(1 0 0)"
  primary: "oklch(0.235 0.012 264)"
  primaryForeground: "oklch(0.985 0.001 264)"
  secondary: "oklch(0.97 0.003 264)"
  secondaryForeground: "oklch(0.255 0.012 264)"
  muted: "oklch(0.972 0.003 264)"
  mutedForeground: "oklch(0.515 0.013 264)"
  accent: "oklch(0.967 0.004 264)"
  border: "oklch(0.917 0.004 264)"
  input: "oklch(0.914 0.004 264)"
  ring: "oklch(0.62 0.028 264)"
  destructive: "oklch(0.585 0.21 27.3)"
  success: "oklch(0.696 0.17 162)"
  brand: "oklch(0.235 0.012 264)"
  brandForeground: "oklch(0.985 0.001 264)"
typography:
  display:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.025em
  title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: 0.9375rem
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: -0.01em
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "Geist Mono, SFMono-Regular, Consolas, monospace"
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: 6px
  md: 8px
  lg: 10px
  xl: 12px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 32px
components:
  button:
    height: 36px
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primaryForeground}"
    rounded: "{rounded.lg}"
    paddingX: 14px
    fontSize: 0.875rem
    fontWeight: 500
  buttonOutline:
    height: 36px
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    border: "{colors.border}"
    rounded: "{rounded.lg}"
    paddingX: 14px
  buttonDestructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primaryForeground}"
    rounded: "{rounded.lg}"
  input:
    height: 36px
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    border: "{colors.input}"
    focusRing: "{colors.ring}"
    rounded: "{rounded.lg}"
    paddingX: 12px
    fontSize: 0.875rem
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.cardForeground}"
    border: "{colors.border}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  cardFooter:
    backgroundColor: "{colors.muted}"
    borderTop: "{colors.border}"
    textColor: "{colors.mutedForeground}"
    paddingX: "{spacing.xl}"
    paddingY: 14px
  badge:
    rounded: "{rounded.full}"
    fontSize: 0.6875rem
    fontWeight: 500
  brandMark:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brandForeground}"
    rounded: "{rounded.md}"
    fontFamily: "Geist Mono, monospace"
  navTab:
    activeText: "{colors.foreground}"
    activeUnderline: "{colors.foreground}"
    inactiveText: "{colors.mutedForeground}"
    hoverBackground: "{colors.muted}"
---

## Overview

Passport is a centralized OIDC identity provider. Its UI is the part users see
when they sign in, manage their account, and authorize applications — so it
optimizes for trust, legibility, and keyboard speed over visual flourish.

The aesthetic is a **neutral control surface**: a Vercel-grade dashboard with a
cool-gray palette, the Geist typeface, generous-but-dense spacing, and crisp
1px borders. There are no decorative patterns, gradients, or illustrations.
Identity comes from one accent (`{colors.brand}`) and the Geist wordmark.

Principles, in priority order:

1. **Neutral & whitelabelable** — no hardcoded brand. Color comes from CSS
   variables; `--brand` (+ optionally `--primary`) and `src/lib/brand.ts`
   rebrand everything.
2. **Scannable & readable** — clear hierarchy, mono for technical values
   (IDs, IPs, scopes), plain-language labels.
3. **Keyboard-first & accessible** — visible focus rings, `⌘↵` shortcuts,
   semantic markup, ARIA live regions, reduced-motion support.
4. **Modular & extensible** — composition over boolean props; adding a page or
   provider is a one-line config change.

## Colors

The palette is a single cool neutral (hue ≈ 264) with no chroma in the grays —
designed, not flat. Both themes are driven by CSS custom properties; the front
matter lists the **light** theme. Under the `.dark` class these resolve to:

- `background` → `oklch(0.185 0.005 264)`
- `foreground` → `oklch(0.96 0.002 264)`
- `card` / `popover` → `oklch(0.216 0.006 264)`
- `primary` → `oklch(0.93 0.003 264)` (light-on-dark inverts)
- `primaryForeground` → `oklch(0.22 0.012 264)`
- `secondary` / `muted` → `oklch(0.272 0.007 264)`
- `mutedForeground` → `oklch(0.712 0.013 264)`
- `accent` → `oklch(0.292 0.008 264)`
- `border` → `oklch(1 0 0 / 9%)`, `input` → `oklch(1 0 0 / 12%)`
- `ring` → `oklch(0.58 0.03 264)`
- `destructive` → `oklch(0.7 0.19 22.2)`
- `brand` → `oklch(0.95 0.002 264)`, `brandForeground` → `oklch(0.22 0.012 264)`

`brand` is intentionally adaptive (near-black in light, near-white in dark) so
the logo tile stays visible without a tenant having to set a dark value.

`success` (emerald) is the **only** non-neutral hue and is reserved for live
status — the "active now" dot on the current session. Never use it for primary
actions or decoration.

## Typography

One typeface family throughout: **Geist Variable** for UI, **Geist Mono** for
machine values. No secondary display face — hierarchy comes from size, weight,
and `letterSpacing`, not from mixing fonts.

- `display` — page `<h1>` titles. Tight tracking for a technical feel.
- `title` — card/section headers (`{components.card}` titles).
- `body` — default text and descriptions; `mutedForeground` for secondary copy.
- `label` — form field labels.
- `mono` — user IDs, IP addresses, OAuth scopes, client IDs, capability footer.

`font-synthesis: none` and antialiasing are enabled globally; never fake bold or
italic weights.

## Layout

A single centered column. Two width tiers off a max-width:

- **Auth forms** (sign-in, consent): `400px` well, vertically centered card.
- **Dashboard** (account, security, sessions, applications): `max-w-4xl`, a
  two-row sticky header, and a `180px` sticky section rail beside the content
  on `lg+` screens (`grid-cols-[180px_1fr]`, `{spacing.2xl}` gap). The rail
  collapses below `lg`; cards stack full-width.
- **Billing administration** is the only wider dashboard exception:
  `max-w-5xl`, a third billing tab row, and no section rail. Billing matrices,
  plan editors, and registry drawers need horizontal comparison space; keep the
  same neutral chrome, typography, card rhythm, and control styling.

The header is two rows: brand + angled-slash breadcrumb + account menu, then a
secondary page-tab strip (`{components.navTab}`). Base spacing follows a 4px
grid; cards pad to `{spacing.xl}`.

## Elevation & Depth

Depth is minimal and physical, never glTabsy. Surfaces lift via **1px borders
first, soft shadow second** — never heavy drop shadows or glows.

- Page background: flat, with at most a faint top-down neutral vignette. No
  patterns or grids.
- Cards: `{colors.border}` + `shadow-sm` at ~4% black.
- Popovers / dialogs / dropdown menus: `shadow-md` + a `1px` ring.
- The sticky header uses `background/75` + `backdrop-blur`.

Motion is restrained and purposeful: a content cross-fade on route changes via
the View Transitions API, with header/footer pinned (`view-transition-name`).
All motion is disabled under `prefers-reduced-motion`.

## Shapes

Consistent, modestly rounded geometry. The radius scale steps `sm → xl`
(6–12px); cards use `{rounded.xl}`, controls use `{rounded.lg}`, inline chips
and avatars use `{rounded.full}`. Icons are Lucide, `1rem`–`1.1rem`, stroke
weight matched to the text. The brand mark is a rounded-square monogram tile.

## Components

Built on Kumo UI, customized for Passport's neutral whitelabel design.
Composition is favored over boolean props (compound `Field` /
`SettingsCard` / `DashboardShell`).

- **button** — primary action: `{colors.primary}` fill, `shadow-sm`, subtle
  press translate. Variants: `outline` (`{components.buttonOutline}`),
  `secondary`, `ghost`, `destructive` (`{components.buttonDestructive}`,
  tinted not solid), `link`. Primary form CTAs use the `lg` size (40px) and may
  carry a `⌘↵` keyboard hint.
- **input** — `{components.input}`; 3px focus ring in `{colors.ring}`,
  `aria-invalid` switches the ring to `{colors.destructive}`. Always wrapped in
  a `Field` that wires `label`, `aria-describedby`, and error text.
- **card** — `{components.card}`. The `SettingsCard` adds an optional muted
  footer bar (`{components.cardFooter}`) carrying a hint on the left and an
  action on the right — the canonical settings row.
- **badge** — `{components.badge}`; neutral by default, `secondary` for muted
  states. Status chips may carry a `{colors.success}` dot.
- **navTab** — secondary header tab strip; active page gets a 2px
  `{colors.foreground}` underline flush to the header border, inactive tabs are
  `{colors.mutedForeground}` with a `{colors.muted}` hover.
- **brandMark** — whitelabel logo tile (`{components.brandMark}`); renders a
  configured image or the monogram from `src/lib/brand.ts`.
- **dialog / dropdownMenu / avatar / separator / skeleton / kbd** — used for
  confirmations, the account menu, profile imagery, dividers, loading states,
  and shortcut hints respectively.

## Do's and Don'ts

**Do**

- Drive all color from semantic tokens / CSS variables so theming and
  whitelabeling work from one place.
- Reserve `{colors.success}` for live status only.
- Use `mono` for any machine-generated value (IDs, IPs, scopes, tokens).
- Keep one accent; lean on weight, size, and spacing for hierarchy.
- Show focus rings, keyboard hints, and ARIA live regions; honor reduced motion.
- Render the page chrome immediately with skeletons; never swap whole layouts
  while loading.

**Don't**

- Don't add background patterns, grids, gradients, or decorative imagery.
- Don't ship raw component-library defaults (e.g. chunky segmented tabs).
- Don't introduce a second typeface or fake font weights.
- Don't use heavy shadows or glows for elevation — border first, soft shadow
  second.
- Don't hardcode the product name, brand color, or copy in components.
- Don't use color (beyond `destructive`/`success`) to carry meaning that isn't
  also conveyed by text or icon.
