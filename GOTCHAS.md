# GOTCHAS

One line each, added the moment something burns a session.

This file is an index, not an archive. It is read by every session at startup and is size-capped
(see `.githooks/pre-commit`), so anything needing more than a line or two lives in
`docs/gotchas/<slug>.md` with a pointer left here. Every gotcha is still listed, so nothing gets
rediscovered the hard way; you only pay for the detail when it is actually relevant.

- Every file directly under `api/` becomes its own Vercel Serverless Function, including
  colocated `*.test.ts` files by this repo's own convention; check the function count against the
  Hobby plan's 12-function cap before adding a new file there, or rely on the `.vercelignore`
  test-file exclusion already in place.
- A cached endpoint's key must be bumped (or given a defensive shape check) any time the cached
  value's shape changes, or it silently serves stale, wrongly-shaped data with no error; this
  exact class of bug has hit the sponsor register, petitions, updates feed, and sponsor history
  more than once each.
- Vercel "Sensitive" environment variables cannot be read back through any channel (dashboard,
  `vercel env pull`, likely the API too) once set; if one is needed locally, rotate it to a fresh
  value with the sensitive flag off, don't try to recover the original.
- Vercel's filesystem-based routing always wins over `vercel.json` rewrites: a literal file at
  `api/<name>.ts` intercepts the request before any rewrite rule can match it.
- Tailwind grid needs an explicit base `grid-cols-N`, not just a `md:` breakpoint one, or grid
  items' default `min-width: auto` lets content blow out the container below that breakpoint.
- A directory holding several sibling projects can itself be an orphaned git repo with its own
  remote and unpushed commits; check `git remote -v` and `git log` before deleting or
  restructuring it rather than assuming it is inert.
- Multiple Claude Code sessions can end up editing this repo concurrently; check `git status` and
  the diff before every commit, and adopt another session's in-place fix rather than layering a
  conflicting one on top of it.
- `import.meta` (so `import.meta.env.VITE_*`) does not survive ts-jest in any module a test
  imports unmocked; `services/apiClient.ts` only gets away with it because every test mocks the
  whole module. Keep build-time config out of jest-tested modules (see the AWIN constants in
  `utils/companyLinks.ts` for the pattern).
