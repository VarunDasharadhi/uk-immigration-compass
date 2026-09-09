# Agent instructions

This file is the shared contract for every harness that reads `AGENTS.md` directly, rather than
`CLAUDE.md`. Claude Code reads it too, via `CLAUDE.md`'s `@AGENTS.md` import. Keep this file
authoritative and self-contained; don't assume the reader has also seen `CLAUDE.md`.

## What this is

UK Immigration Compass: tracks UK immigration sponsorship policy changes and provides a sponsor-license checker and browsable sponsor directory. Public-facing product, live in production.

## Session start

Read `STATE.md` and `GOTCHAS.md` first, both short. Git and any live dashboards outrank any prose
claim about current state; check them before trusting a claim here. `DECISIONS.md` is the
append-only dated decision log: read it before reopening a settled call, add a line when you make
a new one, never rewrite an existing dated line.

Full protocol for what to read on entry, what to write on exit, and what to do when something
unexpected happens: `C:\Users\varun\.agents\PROTOCOL.md`.

## Stack and run commands

React 18 + Vite + TypeScript frontend. Express (`server.js`) serves it locally; Vercel functions (`api/`) serve it in production. AI calls go through OpenRouter (`google/gemini-2.5-flash`). Not Firebase or GCP: `firebase.json` is unused and Firebase Hosting was removed (see `.github/workflows`).

Commands: `npm install`, `npm run dev`, `npm test`, `npm run type-check`, `npm run lint`.

## Verification gate

`npm test` (jest), `npm run type-check` (`tsc --noEmit`), `npm run lint` (`eslint src --ext .ts,.tsx`). All three are real, codified scripts; run all three clean before calling a change done.

This gate is non-negotiable for any harness or agent making code changes here, not just Claude
Code. A change that has not run the gate clean is not done. Do not commit with `--no-verify`. If a
cap or a gate step is genuinely wrong for the content, say so and get it changed rather than
routing around it.

## Repo boundaries

Remote pushes need Varun's go-ahead in that session, every time. Push to `main` runs GitHub Actions CI only (type-check, build), no deploy step; Vercel deploys separately from that.

Run `git status` before any checkout, commit, branch, or reset. If the tree carries changes you did not make, treat the repo as read-only and hand off rather than touch it.

Stray `.patch_*.py` files, `.cache/`, `.tokensave/`, and `.zcode/plans/` at the repo root are pre-existing scratch material, not part of the tracked project; leave them alone.

## Writing style

No em dashes anywhere (user-facing copy, comments, docs). Natural, human phrasing; errors say what
happened and what to do next. Match the surrounding code's conventions.
