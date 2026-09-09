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

`main` was at `08e061b` ("feat: monthly automatic industry-map refresh via cron") before this
task's `chore/agent-contract` branch was cut off it. Most recent work (per `git log`) added a
monthly cron to keep the Companies House industry map fresh, refreshed legal page dates, added
stats strips to News and Browse Sponsors, and trimmed the news modal to its real source.

Per the last real `HANDOFF.md` entry (2026-07-17, before this task tombstoned that file): the
industry-filterable Sponsor Directory shipped end to end (offline Companies House bulk-data join,
86,668 of 125,796 sponsor names matched, 68.9%), 90/90 tests passing at the time, clean
type-check, clean production build. A Vercel Hobby-plan Serverless Function limit deploy failure
caused by that feature was found and fixed in the same session (see `GOTCHAS.md`).

Verification gate: `npm test` (jest), `npm run type-check` (`tsc --noEmit`), `npm run lint`
(`eslint src --ext .ts,.tsx`). All three are real, codified npm scripts.

Last verified: 2026-09-09
