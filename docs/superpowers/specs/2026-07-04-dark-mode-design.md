# Dark Mode Design

## Goal

Add a manual light/dark theme toggle (sun/moon icon) to the header, defaulting
to the visitor's OS preference on first visit, applied consistently across
the entire site (all four tabs, the footer, the Privacy/Terms pages, and the
contact modal), with visual effects (gradients, glows, shadows) preserved so
dark mode looks as polished as light mode rather than a flat recolor.

## Architecture

- **Tailwind strategy:** set `darkMode: 'class'` in `tailwind.config.js`
  (currently unset, which defaults to the `media`-only strategy with no
  manual override). Class-based lets a user's explicit choice win over system
  preference.
- **State:** a `ThemeContext` + `useTheme()` hook holds `'light' | 'dark'`,
  backed by `localStorage` (`key: theme`). On first visit with nothing saved,
  it reads `window.matchMedia('(prefers-color-scheme: dark)')`.
- **No flash of wrong theme:** a small inline `<script>` in `index.html`,
  before the app mounts, reads `localStorage` (falling back to the media
  query) and sets the `dark` class on `<html>` synchronously. React's
  `ThemeProvider` picks up that same initial value on mount rather than
  re-deciding it, so there's no mismatch/flicker.
- **Toggle component:** `ThemeToggle`, a single icon button (moon in light
  mode, sun in dark mode) added to `Header` in `App.tsx`, present in both the
  desktop nav and the mobile menu. Clicking flips the theme instantly and
  persists the choice to `localStorage`.

## Rollout scope

Every component today uses light-only Tailwind color classes — roughly 338
instances across the app:

| File | Color class usages |
|---|---|
| NewsDashboard.tsx | 116 |
| SponsorChecker.tsx | 79 |
| App.tsx | 65 |
| PetitionTracker.tsx | 36 |
| SimplifierTool.tsx | 26 |
| PrivacyPolicy.tsx | 8 |
| TermsOfService.tsx | 8 |

Each existing color class gets a paired `dark:` variant, following a
consistent base mapping so the two themes stay coherent:

- `bg-white` → `dark:bg-slate-900` (page/card surfaces)
- `bg-slate-50` → `dark:bg-slate-800` (secondary surfaces, hover states)
- `text-slate-900` → `dark:text-slate-100` (primary text)
- `text-slate-500` / `text-slate-600` → `dark:text-slate-400` (secondary text)
- `border-slate-100` / `border-slate-200` → `dark:border-slate-700`
- Category accent backgrounds (blue/amber/pink/green tints used for badges,
  callout boxes, icon chips, e.g. `bg-blue-50`, `bg-amber-50`) → muted dark
  equivalents such as `dark:bg-blue-950/40`, keeping the colored accent
  legible without it glowing too brightly against a dark surface.

## Preserving effects (gradients, glows, shadows)

The site currently leans on gradients, colored glow shadows, and
backdrop-blur for polish (e.g. the header logo's
`bg-gradient-to-br from-blue-700 to-indigo-800`, hero section gradients,
`shadow-blue-900/10`-style colored glows on buttons, `backdrop-blur-xl` on
the sticky header, and card shadows like `shadow-slate-200/50`). These need
dark-aware treatment, not a flat removal:

- **Colored glow shadows** (e.g. `shadow-blue-600/30` on buttons) generally
  keep working against dark backgrounds since they're a colored glow rather
  than a directional drop shadow; where needed, opacity is bumped slightly
  (e.g. `dark:shadow-blue-500/40`) so the glow stays visible.
- **Neutral card shadows** (e.g. `shadow-slate-200/50`, meant to be a faint
  shadow against a white card) get a dark equivalent based on black/slate-950
  (e.g. `dark:shadow-black/40`), since a light-slate shadow is invisible
  against a dark card.
- **Gradients** (header logo, hero background, chart accents) are kept as-is
  where the gradient itself is already a saturated color (e.g.
  `from-blue-700 to-indigo-800`), since those read fine on both themes; only
  gradients that fade into a light neutral (e.g. `from-slate-100`) get a dark
  counterpart (e.g. `dark:from-slate-800`).
- **Backdrop blur** (`backdrop-blur-md`, `backdrop-blur-xl` on the sticky
  header and modals) is unaffected by theme, no change needed, just paired
  with the header's own `dark:bg-*/opacity` background.

## Testing

1. `tsc --noEmit` after implementation.
2. Playwright pass: toggle the theme, screenshot each of the 4 tabs plus
   Privacy Policy, Terms of Service, and the Contact modal in both light and
   dark, checking for any element that still reads as unstyled (a light card
   left on a dark background, invisible text, a shadow that disappeared).
3. Confirm the toggle persists across a page reload (localStorage) and that
   a fresh browser profile with no saved preference matches
   `prefers-color-scheme`.

## Out of scope

- No "System" option in the toggle UI itself (decided: simple two-state
  sun/moon toggle, not a three-way System/Light/Dark control). System
  preference is only used as the *initial* value before any manual choice
  is made.
- No per-component theme customization beyond the mapping above.
