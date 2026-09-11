# uk-immigration-compass STATE

Git and any live dashboards outrank this file; check them before trusting a claim here.

This file holds only what is true right now. History and session narrative live in
`docs/journal/`, settled calls live in `DECISIONS.md`, gotcha detail lives in `docs/gotchas/`. It
is size-capped by `.githooks/pre-commit` (see `PROTOCOL.md`); move content out rather than
deleting it. Never describe uncommitted work here, `git status` covers that live and accurately.

## What this is

UK Immigration Compass: tracks UK immigration sponsorship policy changes, with a sponsor-license
checker and a browsable, industry-filterable sponsor directory. React 18 + Vite + TypeScript
frontend, Express (`server.js`) locally, Vercel functions (`api/`) in production. AI calls go
through OpenRouter (`google/gemini-2.5-flash`). No Firebase or GCP dependency despite the leftover
`firebase.json`, that path was removed. Has its own GitHub remote, `main` branch.

## Where the code stands

`main` is at `d62276d`; everything through it is committed AND deployed, including the email
alerts. 116/116 tests, type-check, lint (matches nothing by pre-existing script shape) and
production build all green. See `docs/journal/2026-09-11.md` for the full session narrative;
highlights:

- Email alerts LIVE and verified in production (2026-09-11): double opt-in capture card on the
  News tab, `/api/alerts/*` routes riding the api/index catch-all (api/ sits at Vercel Hobby's
  12-function cap, no new function files), subscribers in the shared Upstash Redis, daily digest
  sent from the nightly refresh cron via Resend. RESEND_API_KEY is in Vercel production (added
  via CLI, Sensitive). Subscribe, Gmail delivery of the confirmation, and confirm-link round
  trip all verified live; first digest fires on the nightly cron (00:00 UTC) with a Gmail check
  scheduled the next morning. Resend is still on the sandbox sender (onboarding@resend.dev), so
  only the Resend account owner's address receives mail until a domain is verified at
  resend.com/domains and ALERTS_FROM_EMAIL is set; other signups get an honest send-failure error.
- Ko-fi footer button wired behind an empty `KOFI_URL` constant in App.tsx (hidden until Varun
  sets the URL). Adzuna added to the sponsor card's open-roles links, routed through AWIN once
  both ID constants in `utils/companyLinks.ts` are filled (source constants, not env vars).
- Mature navy palette everywhere (sky/cyan/teal fully retired); light-mode header is white
  with navy logo tile + `#16243d` nav tray; every tab opens a dark PageHero band with themed
  silhouette art (`components/bandArt.tsx`).
- Petitions: milestone lanes replace Recharts (dropped from bundle); news-style detail modal.
- Sponsors: sidebar lists real register movements (`/api/sponsor-changes`, ledger-backed).
- Perf: session cache (`utils/cache.ts`) + directory prefetch; orbs are radial gradients.
- SEO layer live: per-tab titles/canonicals, soft-404 noindex, sitemap+robots, self-hosted
  Inter, FAQ+JSON-LD, Search Console verified. Homepage indexed on Google (archive pending).
- URL hash restores tab + sponsors view on refresh.

Design gotcha that bit twice this session: when converting `bg-gradient-to-*` to a solid
colour, the dead gradient class must be removed or it inherits the page gradient's white
stops (caused the "white logo tile / washed pills" bugs).

User rules (strict): deploy only on an explicit "deploy"; commit locally otherwise. UK
English, no em dashes, professional navy look (bright cyan and flag colours both rejected).

Verification gate: `npm test` (jest), `npm run type-check` (`tsc --noEmit`), `npm run lint`
(`eslint src --ext .ts,.tsx`). All three are real, codified npm scripts.

Last verified: 2026-09-11
