# HANDOFF, RETIRED 2026-09-09

This file is retired. Never append new session entries here. Current facts are in `STATE.md`,
dated decisions in `DECISIONS.md`, gotchas in `GOTCHAS.md`, session narrative in
`docs/journal/`. This file's content below is kept as history only.

# UK Immigration Compass

## Latest session (2026-07-17, morning) -- industry-filterable Sponsor Directory built end to end, then a Vercel function-limit deploy failure fixed

### What was done
1. **Declined a "discussions/forum" feature and confirmed Vercel Analytics was already live** -- both quick decisions before the main build. Recommended against a user-generated discussion section given the moderation/legal-risk burden for a solo immigration-advice site; user agreed to leave it. Separately confirmed `@vercel/analytics` and `<Analytics />` were already installed and disclosed in the privacy policy from an earlier session, so "install vercel analytics" needed no action.
2. **Planned a "Browse sponsors" directory with industry filtering for the Sponsor Checker** -- explored the codebase first and found the real blocker: the GOV.UK sponsor register (~130k rows, in-memory) carries no industry data at all, only name/town/route/rating. Industry only ever existed via a live, one-company-at-a-time Companies House lookup, which cannot cover the whole register. Asked the user how far to go; they asked for the most efficient real solution. Landed on an offline precompute join: a script that downloads Companies House's free monthly bulk company-data dump, joins it against the register by canonical name, and rolls SIC codes up to the 21 official SIC 2007 sections into a committed static artifact -- no live API calls at request time, no new infrastructure.
3. **Built and ran the full pipeline** -- `utils/canonicalName.ts` (extracted the existing name-canonicalization logic so the register, Companies House lookups, and the new join all agree on identity), `services/sicSections.ts` (SIC 2007 division-to-section taxonomy), `scripts/build-industry-map.ts` (streams the ~2.5GB Companies House bulk CSV via `unzipper`, matches against the register, emits `data/sponsor-industry-map.json`), and `services/sponsorDirectory.ts` (dedupe/filter/facet/paginate). Ran the script for real: matched 86,668 of 125,796 sponsor names (68.9%), producing a 1.6MB artifact. Unmatched names bucket into an honest "Other / Unknown" facet rather than being dropped.
4. **Added the serving and UI layers** -- `api/sponsor-directory.ts` (new rate-limited, cached endpoint) plus a matching `server.js` route for local dev, a new `'browse'` rate-limit preset (60/min) in `services/rateLimit.ts`, new types and an `apiClient.fetchSponsorDirectory` method, and `components/SponsorDirectory.tsx` -- a searchable, industry/route-filterable, paginated card grid wired into `SponsorChecker.tsx` behind a "Check a company / Browse sponsors" toggle. Clicking a sponsor card jumps to the Check tab and runs the real lookup.
5. **Tested and verified thoroughly before committing** -- 90/90 tests passing across 13 suites (new coverage for the canonicalizer, SIC section mapping, directory service, API endpoint, and component), clean typecheck, clean production build. Verified against real data: curl against the live local endpoint confirmed correct, non-obvious industry resolution (Tesco Stores Limited -> Wholesale & Retail, Tesco Personal Finance plc -> Finance & Insurance, both genuinely accurate). Drove the actual browser with Playwright end to end -- filtered by industry and search together, clicked through to a resolved "Active Sponsor License" result, confirmed dark mode. Committed `e60a99e` and pushed to `origin/main`.
6. **Fixed a Vercel deploy failure caused by the new feature** -- the user reported "No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan." Root cause: every file directly under `api/` becomes its own Serverless Function via Vercel's zero-config filesystem routing, including jest `*.test.ts` files that live alongside their source by convention. `api/company-lookup.test.ts` was already silently wasting one slot; adding `api/sponsor-directory.ts` plus `api/sponsor-directory.test.ts` pushed the total from 11 to 13, over the cap. Added `.vercelignore` excluding `**/*.test.ts` and `**/*.test.tsx`, bringing the real function count back to 11. Verified tests and typecheck still pass, committed `a04509e`, pushed.

### Current state
- Everything is committed and pushed to `origin/main` at `a04509e`; Vercel should auto-deploy and this time stay under the 12-function Hobby cap.
- `data/sponsor-industry-map.json` is a committed static artifact (generated 2026-07-17, 68.9% match rate, 86,668 companies across 21 industries) -- not yet regenerated on any schedule; rerun `npm run build:industry-map` manually when a refresh is wanted.
- The Sponsor Directory feature itself was fully verified locally (curl + Playwright) before the deploy-breaking issue surfaced; the deploy fix has not yet been watched live in production.
- `.superpowers/`, `.tokensave/`, and `HANDOFF.md` remain untracked by choice, unchanged from prior sessions.

### Next steps
1. Confirm the Vercel deployment for `a04509e` actually goes BUILDING -> READY this time, then spot-check the "Browse sponsors" tab on the real production URL.
2. Consider automating the industry-map rebuild (e.g. a monthly GitHub Action running `npm run build:industry-map` and opening a PR) so newly-added sponsors don't sit under "Other / Unknown" indefinitely -- explicitly scoped out of v1.
3. Items from the 2026-07-05 afternoon entry (`COMPANIES_HOUSE_API_KEY` in Vercel prod env, SIC-table retry-after-latch behavior on serverless cold starts) were not touched this session and still stand if unresolved.

### Gotchas
- **Every file under `api/` is a Serverless Function on Vercel, including test files that happen to live there by this repo's own colocation convention.** There is no default exemption for `*.test.ts`. Any new file added to `api/` -- test or otherwise -- counts against the plan's function limit; check `find api -name "*.ts" | wc -l` against the plan cap before adding one, or rely on the new `.vercelignore` test-file exclusion.


## Latest session (2026-07-11, evening) -- workspace-wide cleanup: dead Claude Code API proxy override fixed, exposed credentials relocated, stale public-repo git history archived and removed

### What was done
1. **Fixed Claude Code CLI/extension failing to connect from this project folder** -- `.claude/settings.local.json` had `ANTHROPIC_BASE_URL` pointed at `http://127.0.0.1:8787`, a local proxy with nothing listening on it (confirmed via curl and netstat), and no reference to it anywhere else in the repo. Removed the override with the user's confirmation. The setting is gitignored globally, so this was a local-only fix.
2. **Swept every other project for the same class of issue** -- checked all other repos under `C:\Users\varun\repos\`, `my-EA`, and both global Claude Code config files (`~/.claude/settings.json`, `settings.local.json`) for any `env` override touching API connectivity. Nothing else was affected; the bad override was isolated to this one project.
3. **Found and fixed a live credential exposure while listing sibling repos** -- `C:\Users\varun\repos\api_keys.txt` held roughly 25 live plaintext credentials (OpenAI, Anthropic, GitHub tokens, a Vercel token, a Neon Postgres connection string with password, etc.) sitting directly inside the working tree of what turned out to be a live git repo. Moved it to `C:\Users\varun\secrets\api_keys.txt`, fully outside any git working tree.
4. **Discovered `C:\Users\varun\repos\` itself was a stale, forgotten git repo pushed to the public `uk-immigration-compass` GitHub repo** -- it held the project's original early history from before it was restructured into the `uk-immigration-compass/` subfolder: 19 commits that were never pushed anywhere and don't exist in the current project's git history at all (a completely disconnected lineage, different commit hashes throughout). `api_keys.txt` had been sitting in that repo's working tree, protected only by a single `.gitignore` line.
5. **Archived the stale repo's full history before deleting it** -- created and verified a git bundle (`git bundle create ... --all`, confirmed "records a complete history") capturing all local and remote-tracking refs, saved to `C:\Users\varun\archives\repos-root-stale-git-20260711-181151.bundle` (471 KB). Only then removed the `.git` folder at the repos root. Confirmed afterward that every sibling project folder, including the real `uk-immigration-compass/.git`, was completely unaffected.

### Current state
- `C:\Users\varun\repos\` is no longer a git repository; it is now just a plain folder holding independent per-project repos, matching how it is actually used day to day.
- `api_keys.txt` lives at `C:\Users\varun\secrets\api_keys.txt`, outside any git working tree.
- The 19 orphaned early commits, and all other refs from the stale repo, are preserved in `C:\Users\varun\archives\repos-root-stale-git-20260711-181151.bundle` if ever needed again; restorable with `git clone <bundle path> <destination>`.
- No application code in `uk-immigration-compass` changed during this part of the session; this was workspace-level cleanup discovered while working in this project, not product changes.

### Next steps
1. None outstanding -- all three issues (dead API proxy, exposed credentials, stale public-repo git history) are fully resolved and verified.
2. Longer term, worth reconsidering whether `api_keys.txt` as a single master file is the right home going forward -- a password manager or per-project `.env.local` files would shrink the blast radius of any future single leak. Flagged to the user; they chose to keep it as one relocated file for now.
3. Items from the 2026-07-05 afternoon entry (Companies House API key in Vercel prod env, SIC-table retry-after-latch behavior, sponsor-links worktree cleanup) still stand, untouched this session.

### Gotchas
- **A project's original working directory can be left behind as an orphaned git repo once the project is restructured into a subfolder.** If a directory holding several unrelated sibling projects ever turns out to itself be a git repo, check `git remote -v` and `git log` before assuming it is inert -- this one was still connected to a public GitHub remote and held 19 unpushed local commits that would have been silently lost by a careless delete.


## Latest session (2026-07-11, afternoon) -- Vercel Analytics verified live, both pre-existing CSP violations fixed and shipped

### What was done
1. **Verified Vercel Web Analytics is actually collecting data in production** -- the code side was already correct (`@vercel/analytics` installed, `<Analytics />` rendered at the root in `App.tsx`), so verification focused on the Vercel dashboard and live traffic rather than code changes. Confirmed Web Analytics is enabled (`/_vercel/insights/script.js` returns 200, not 404), drove the real production URL with Playwright, and confirmed a real pageview beacon (`POST /_vercel/insights/view` -> 200) fires on both hard page loads and, separately, on a client-side `history.pushState` route change (the Analytics script's own SPA-tracking hook), with no CSP errors blocking it.
2. **Found and fixed the two pre-existing CSP violations flagged in the 2026-07-05 morning entry** -- an inline `<script>` in `index.html` (dark-mode FOUC prevention) was silently blocked by `script-src 'self'`, and a `transparenttextures.com` background image was silently blocked by `img-src 'self' data:`. Externalized the script verbatim to `public/theme-init.js` (kept as a plain synchronous script, not a module, so it still runs before first paint) and self-hosted the texture at `public/textures/cubes.png` instead of loosening the CSP to allowlist a third party. Commit `bacb047`.
3. **Verified both fixes locally and live** -- `npm run build` (tsc + vite build) succeeded, both new `public/` assets copied into `dist/` unchanged, 41/41 tests passing. Built and served the production bundle locally with `vite preview`, confirmed via Playwright that both requests now resolve same-origin with 200 and dark mode still applies pre-paint with no flash. Pushed to `origin/main`, watched the resulting Vercel deployment (`dpl_9CGv4kT1UcSabrgKdzAGKJqqi6WH`) go from BUILDING to READY, then re-drove the real production URL and confirmed zero console errors and no CSP violations on a fresh navigation.

### Current state
- Vercel Web Analytics is confirmed live and collecting real pageview data, including SPA route changes, at `uk-immigration-compass.vercel.app`.
- Both CSP violations are fixed and confirmed live in production (commit `bacb047`, deployment `dpl_9CGv4kT1UcSabrgKdzAGKJqqi6WH`, READY). No CSP directives were loosened; both fixes made the offending resources same-origin instead.
- `.superpowers/`, `.tokensave/`, and `HANDOFF.md` remain untracked by choice, unchanged from prior sessions.

### Next steps
1. No open follow-up from this session -- both the analytics verification and the CSP fixes are closed out end to end (fixed, tested, deployed, and confirmed live).
2. Items from the 2026-07-05 afternoon entry (Companies House API key in Vercel prod env, SIC-table retry-after-latch behavior on serverless cold starts, sponsor-links worktree cleanup) still stand and were not touched this session.


## Latest session (2026-07-05, afternoon) -- sponsor "Find out more" feature built via subagent-driven-development, then live-tested and polished

### What was done
1. **Brainstormed and specced a new Sponsor Checker feature** -- design doc at `docs/superpowers/specs/2026-07-05-sponsor-links-design.md`: real "Nature of business" data (previously always "Unknown" since GOV.UK's register CSV never has it) plus a "Find out more" section of constructed search links (company details and open roles), sourced from the free official Companies House API. Verified the SIC-code-to-description source (Companies House's own published CSV) and the Companies House search/profile API shape by fetching them directly rather than guessing.
2. **Wrote a 5-task implementation plan** (`docs/superpowers/plans/2026-07-05-sponsor-links.md`) and executed it with subagent-driven-development in an isolated worktree (`worktree-sponsor-links`): SIC code lookup table, Companies House client with cached exact-match-only resolution, a new `/api/company-lookup` endpoint, pure URL builders for 7 search links, and Sponsor Checker UI integration. Each task got an implementer + independent reviewer; review rounds caught and fixed five real bugs before merge: an unhandled fetch rejection, a rate-limit response cached as a false negative, a rate-limiter failure that could 500, links rendering for unconfirmed "Not Found" searches, and (in the final whole-branch review) a SIC-table cache that could permanently latch empty after one transient failure. Merged to main as `abaa6a3`.
3. **Live-tested in the browser and iterated based on real usage** -- restarted local dev servers, got a free Companies House API key, and fixed real issues surfaced by actually using the feature: multiple SIC codes were being truncated to just the first one (now shows all as a bullet list), the Companies House link label was unclear to laypeople (relabelled "GOV.UK"), Location repeated the same town already in the heading (now shows the real Companies House registered office address), the "Company" status cell was pure duplication of the heading (removed), and Routes rendering improved from a comma-joined string to a bullet list. Companies House cache version bumped twice (v2, v3) as the cached shape changed, avoiding the stale-cache-masks-shape-change bug this project has hit repeatedly before.
4. **Found and fixed an unrelated Jargon Buster UI bug while live-testing** -- the floating translate button was clipped unevenly by the output panel's rounded corner once repositioned, then (after uncropping) turned out to be mis-centered in the column gap and overlapping the "Plain English" label. Fixed by moving the button outside the panel's `overflow-hidden` container and properly centering it in the gap; mobile button changed from an absolutely-positioned overlay to a normal block between the stacked panels.
5. **Committed and pushed everything to origin/main** -- commit `634786a` on top of the merged feature branch. 41/41 tests passing, type-check clean throughout.

### Current state
- All of the above is committed and pushed to `origin/main` (`HEAD` at `634786a`); Vercel will auto-deploy.
- `COMPANIES_HOUSE_API_KEY` is set in local `.env.local` for dev testing; not yet confirmed set in Vercel's production environment variables. Without it, the feature degrades gracefully (search links only, "Unknown" nature of business) rather than breaking.
- Companies House lookups are cached ~90 days per company (`ch-lookup:v3:...`); SIC code table cached indefinitely (`sic-codes:v1`).
- A commit not authored this session (`c9f131c`, "bump sponsor cache version so the revoke/re-grant fix isn't masked") was already in local `main`'s history from a concurrent session and got swept up in the push -- benign, consistent with this project's known pattern of concurrent sessions.

### Next steps
1. Confirm `COMPANIES_HOUSE_API_KEY` is set in Vercel's production environment variables so the live site gets real nature-of-business data and profile links, not just the graceful-degradation fallback.
2. Watch the first few production searches after deploy to confirm the Companies House integration behaves the same live as it did in local testing (real API rate limits, real company data shapes).
3. Consider a documentation pass or repo issue for the SIC-table "no retry after latch" limitation noted during the final whole-branch review (now fixed for the empty-map latch specifically, but confirm behavior holds on Vercel's serverless cold-start model vs `server.js`'s persistent process).
4. Remove the `.claude/worktrees/sponsor-links` worktree reference if it still shows in `git worktree list` (it was removed via `ExitWorktree` this session, but double check on next session start).


## Latest session (2026-07-05, morning) -- news duplicate detection, false sponsor revoke/re-grant fix, verified live twice

### What was done
1. **Fixed near-duplicate news cards surviving across separate AI calls** -- the daily refresh and the per-category backfill each phrase the same real-world policy event differently (e.g. "Visa Brake Imposed on..." vs "Suspension of Visa Routes for..."), so the existing lexical dedup key let both through as "distinct." A first attempt (asking the generation prompt to avoid a list of known titles) was tested live and failed -- the model still re-generated a paraphrase. Replaced with a dedicated classifier call (`isDuplicateEvent`) run at `temperature: 0` (found the same pair could flip DUPLICATE/NEW at default temperature) and sequentially, not in parallel, since two duplicates can arrive in the same AI response and parallel checks against a frozen archive snapshot missed that. Tuned the classifier prompt with an explicit example after it initially failed to treat "policy announcement" vs "implementing guidance" as the same event. Commit `75f5792`.
2. **Fixed a hardcoded Vite HMR port causing a dev-server reload loop** across multiple worktrees -- dropped the explicit port so Vite picks a free one. Commit `17e0100`.
3. **Diagnosed and fixed false "Revoked then Granted" blips in the Sponsor Checker** -- user reported the pattern on Yagshree Consultancy Limited and Visionolic Ltd. Traced to the raw upstream ledger (`res.licensed-sponsors-uk.com`) itself: a scrape glitch marked exactly 789 companies "removed" on 2026-06-05 and the same 789 "added" again on 2026-06-08 in one bucket alone (158/158 in another), an exact-matching count across effectively the whole register, not real revocations. `findCompanyRecords` now strips a removed/added pair when the gap is under 30 days. Commit `a1e934e`.
4. **Verification caught the fix being masked by its own cache** -- after deploying `a1e934e`, production still served the stale blip for both companies even on a confirmed fresh deploy (`X-Vercel-Cache: MISS` ruled out CDN caching). Root cause: `checkSponsorOnce` caches full results per company in Redis under `sponsor:v2:<name>` with a 24h TTL, and both companies had been queried against production earlier in the session, before the fix shipped. Bumped to `sponsor:v3` per the code's own existing convention for this exact situation. Commit `c9f131c`.
5. **Verified both fixes live on production twice** -- once for the news dedup (local end-to-end against real OpenRouter calls, reproducing and then confirming the fix on the exact failing case), and once for the sponsor fix (curl against `/api/sponsor-status` plus a full Playwright pass through the real Sponsors tab UI, both before and after the cache-version bump). A genuinely revoked company unrelated to the scrape glitch was spot-checked to confirm the new 30-day filter doesn't swallow real revocations.

### Current state
- All of the above (`17e0100`, `75f5792`, `a1e934e`, `c9f131c`) is committed, pushed, and confirmed live in production.
- A concurrent session merged a "sponsor checker links + Companies House lookup" feature into local `main` on top of this work (`9cd6ee2` through `abaa6a3`, 9 commits plus a merge) -- fully committed locally but **not yet pushed**, and not reviewed in this session. That session also had further uncommitted edits in `components/SponsorChecker.tsx`, `services/companiesHouse.ts`, `utils/companyLinks.ts`, and their test files at the time of writing.
- Local branch is 11 commits ahead of `origin/main`.
- `HANDOFF.md` and `.superpowers/` remain untracked by choice.

### Next steps
1. Decide whether to push the Companies House / sponsor-links feature work as-is, or review it first -- it touches a new external API integration (Companies House) and hasn't been checked in this session.
2. Once that's resolved, confirm the concurrent session's further uncommitted local edits get committed (or discarded) rather than left sitting in the working tree.
3. Consider the two pre-existing CSP console errors noticed while verifying on production (an inline `<script>` blocked by `script-src 'self'`, and a `transparenttextures.com` background image blocked by `img-src 'self' data:`) -- unrelated to this session's fixes but real and currently firing on every page load.

### Gotchas
- **A search-logic fix can ship "working" and still be invisible in production** if the function's result is cached under an unversioned key -- this is now the fourth time this exact class of bug has hit this project (sponsor register, petitions, updates feed, and now sponsor history). Any change to `checkSponsorOnce`/`findCompanyRecords`-style logic needs its cache version bumped in the same commit, not as an afterthought caught only by verifying against the live site.
- **Vercel "Sensitive" environment variables cannot be retrieved through any read channel once set** -- not the dashboard, not `vercel env pull`, likely not the API either. Confirmed live: pulling `CRON_SECRET` returned an empty string. If a sensitive secret is ever needed locally, it has to be freshly rotated to a new value with the sensitive flag left off (or read once at creation time), not recovered after the fact.

## Latest session (2026-07-04, night) -- dark mode rollout, careful merge with a concurrent feature branch, live production fix

### What was done
1. **Added a Contact modal and Privacy Policy / Terms of Service pages** -- footer now has working links to both, plus a "Contact / Report an Issue" button that opens a small modal with a copy-to-clipboard email instead of a slow `mailto:` link.
2. **Brainstormed and planned full site-wide dark mode** -- wrote a design spec and an 8-task implementation plan (`docs/superpowers/specs/2026-07-04-dark-mode-design.md`, `docs/superpowers/plans/2026-07-04-dark-mode.md`), then executed it with subagent-driven development in an isolated git worktree (`.claude/worktrees/dark-mode`, branch `worktree-dark-mode`). Each task (theme context/FOUC prevention, header toggle, and per-file dark styling for News, Sponsors, Petitions, Jargon Buster, Privacy/Terms) was implemented and reviewed independently, plus a theme-aware color fix for the Petitions bar chart (Recharts renders via inline SVG props, not Tailwind classes, so `dark:` variants don't reach it).
3. **Final whole-branch review caught a real bug before merge** -- `contexts/ThemeContext.tsx`'s `getInitialTheme()` called `localStorage`/`matchMedia` with no try/catch; in a browser blocking site storage this would throw inside a `useState` initializer with no error boundary above it, blank-screening the whole app. Fixed and independently re-verified resolved.
4. **Merged with a concurrent session's "durable updates archive" feature** -- that work had refactored `NewsDashboard.tsx`, extracting the news card and detail modal into `components/news/UpdateCard.tsx` / `UpdateDetailModal.tsx` / `newsShared.tsx`, and restructured `App.tsx` around `react-router-dom` (new `/updates/archive` route). Reconciled by re-applying the exact same reviewed dark classes onto the new file locations, and found + fixed a real gap the plan couldn't have anticipated: the new `UpdatesArchivePage.tsx`'s own header/search/pills/states had zero dark styling. Verified the merged result with a production build served locally and driven by Playwright in both themes before pushing. Merge commit `a866cb0`.
5. **Live site broke after the merge deployed** -- the News tab showed "No updates found" in production. Root cause: the archive-feature merge changed `getUpdates()`'s response shape from `{text, sources}` to `{items, sources}` but reused the same unversioned `updates` Redis key, so prod's stale pre-refactor cached value was served verbatim, same class of bug as the sponsor-register and petitions caches hit previously in this project. A second concurrent session was independently fixing this exact bug at the same time with a shape-validation guard in `getUpdates()`; adopted that approach (reverted my own conflicting cache-key-rename edits to stay consistent with it) rather than duplicating the fix. Commit `b8b3bcb`.
6. **Verified the fix live** -- confirmed via Playwright against the real production URL that the News tab now renders real update cards and the Verified Sources sidebar again.

### Current state
- Dark mode is live: sun/moon toggle in the header, defaults to system preference, persists via `localStorage`, covers every page including the new archive page, chart, and both content-page footers.
- The updates archive feature (`/updates/archive`) is live and dark-mode styled.
- The News feed cache bug is fixed and confirmed live; real update data is rendering again.
- `vite.config.ts` still has an uncommitted local fix (removing the hardcoded HMR port that caused a dev-server reload loop when multiple worktrees are open) -- pending from earlier this session, still not committed.
- The `.claude/worktrees/dark-mode` worktree still exists on disk (branch `worktree-dark-mode`), not yet cleaned up.

### Next steps
1. Commit (or drop) the pending `vite.config.ts` HMR-port fix -- it's been sitting uncommitted across multiple sessions now.
2. Decide whether to remove the `.claude/worktrees/dark-mode` worktree now that its branch is fully merged into main.
3. Spot-check the other Redis-cached feeds (petitions, sponsor register, sponsor news) for any other unversioned keys that could mask a future shape change the same way `updates` just did.
4. Items 1-3 from the 2026-06-08 entry still stand (GCP worker, `.github/workflows/deploy.yml`) -- long open, not addressed this session.

### Gotchas
- **Unversioned Redis cache keys keep masking shape changes in production** -- this is now the third time in this project (sponsor register, petitions, and now the updates feed): whenever a cached value's shape changes, the old key must be bumped (`key:v2`) or a defensive shape check added, or the code silently serves stale, wrongly-shaped data forever with no error. Worth treating as a standing rule for any future response-shape change on a cached endpoint.
- **Two other Claude Code sessions were editing this same repo concurrently during this session** -- once during dark-mode implementation (a "durable updates archive" feature editing the same files), and once while diagnosing the live production bug (another session fixing the identical `getUpdates()` issue at the same time). Checked `git status`/diffs before every commit and adopted the other session's in-place fix rather than layering a conflicting one on top, twice.

## Latest session (2026-07-05, early hours) -- GCP cleanup, dead workflow removal, duplicate-content fix, and a durable updates archive

### What was done
1. **Decommissioned six pieces of orphaned live GCP infrastructure** -- installed and authenticated `gcloud` CLI (not previously set up on this machine), then found and deleted 3 Cloud Functions v2 (`getDashboardData`, `getImmigrationData`, `refreshImmigrationData`), a Cloud Scheduler job that was silently failing every night hitting the deleted `gcp-worker/` code, and two more orphaned Cloud Run services (`uk-immigration-compass`, `uk-immigration-sponsor-tracker` in `us-west1`). Two of the functions were publicly invokable (`allUsers`) with zero real traffic. Confirmed `.github/workflows/deploy.yml`'s target service never existed in this project (that workflow never actually ran) before deleting the file. Also removed the dead Firebase Hosting PR-preview workflow (`firebase-hosting-pull-request.yml`, referenced a `public/script.js` that hasn't existed since the pre-Vite rewrite) while explicitly leaving `firebase-hosting-merge.yml` alone since it had been repurposed into the only CI check on `main`. Commit `92ac9f9`.
2. **Diagnosed a duplicate/near-duplicate news card bug** -- the AI update-generation prompt forced "at least 1-2 per category," which pressured it to split one real event into multiple cards to hit quota (confirmed live: a settlement English-language requirement appeared as two separate cards, one citing "B2 CEFR" and one "A-Level standard," same policy). Fixed the prompt to require genuine distinctness and explicit dedup instead of a quota.
3. **Built a durable per-category update archive so no category (e.g. Family) ever sits empty** -- added a Redis-backed archive of every parsed update (deduped against re-surfaced coverage of the same event, pruned after ~1 year), moved AI-response parsing from the client into the server so structured items can be archived, and changed the homepage feed to backfill a thin category from real archived history instead of leaving it empty or padding it with invented items. Added a one-time per-category search that seeds a category with real 12-month-old coverage if the daily search hasn't touched it recently -- verified live that when only 2 real Student items existed, it reported 2, not a padded 4. Commit `996bb5c`.
4. **Turned "Explore Updates" into a real page** -- added `react-router-dom` and a `/updates/archive` route showing the full past year of updates with search and category filtering, instead of a scroll-to-section trick. Extracted card and detail-modal rendering out of `NewsDashboard.tsx` into `components/news/` so both pages share one implementation. Commit `996bb5c`.
5. **A concurrent session merged in dark mode while this work was in flight** -- theme context, dark styling across every page, and a contact modal/Privacy/Terms pages landed via `worktree-dark-mode` (commits `ebfdb73` through `a866cb0`). That merge surfaced a real bug: prod's Redis still held the old `{text, sources}` cache shape under the `updates` key after the archive refactor shipped, so `getUpdates()` returned it verbatim and the News feed showed "No updates found" live. Fixed in `b8b3bcb` by only trusting a cached value that actually has an `items` array, falling through to a live refresh otherwise.

### Current state
- All of the above is committed and pushed to `main` (`HEAD` matches `origin/main`); Vercel auto-deploys.
- GCP project `gen-lang-client-0461004021` now shows 0 Cloud Run services, 0 Cloud Functions, 0 Scheduler jobs -- verified via `gcloud` after deletion.
- The updates archive is live-data-dependent: categories will fill in for real as the nightly cron (and the one-time per-category backfill) runs, not instantly.
- `vite.config.ts` has an uncommitted one-line local change (drops explicit `port` from the Vite HMR config) -- left as is, not part of this session's work.

### Next steps
1. Watch the first few nightly cron runs to confirm the per-category backfill actually clears every category and the archive keeps growing correctly.
2. Decide whether the past-year archive needs a lighter/paginated server response once it grows well beyond the current ~16 items -- current design loads the whole archive client-side.
3. `firebase-hosting-merge.yml`, `firebase.json`, and `.firebaserc` are still around as harmless leftovers from the pre-Vercel era (the merge workflow now only runs a plain build/type-check, not a Firebase deploy) -- fine to leave, or clean up in a future pass.

## Latest session (2026-07-04, night) -- production register fix, petitions rebuild, security hardening, UI bug sweep

### What was done
1. **Fixed sponsor searches returning "Not Found" for everything on the live site** -- `api/sponsor-status.ts` is the actual file Vercel routes `/api/sponsor-status` to in production (filesystem routing beats the `vercel.json` rewrite to `api/index`), but it never called `initCache()`, so the in-memory sponsor register and revoked-company index (too big for the shared Redis cache) were permanently empty on that function. Every search, including for genuinely licensed companies like Capgemini and Deloitte, silently returned empty. Added `ensureSponsorDataLoaded()`, a memoized loader the handler awaits before searching, and versioned the sponsor cache key (`sponsor:v2:...`, 24h TTL) so a stale cached result can't mask a fix again. Commit `cf7420a`.
2. **Rebuilt the petitions tracker on Parliament's official live API** -- the AI-guessed "top 4-6 petitions" search was picking petitions with as few as 18 signatures and calling them "Trending Right Now"; the real top petition right now has 13,000+ signatures. Replaced with `petition.parliament.uk/petitions.json`, sorted by real signature count. Replaced the fully-fabricated Mon-Sun "Signature Velocity" chart with a horizontal bar chart of real petitions and real counts. Commit `91388ab`.
3. **Removed dead code and low-value UI** -- deleted `gcp-worker/` (a full standalone Gemini/Firestore Cloud Function, unreferenced since the OpenRouter migration) and its `gcp:deploy` script, four unused dependencies, debug `console.log`s shipped to production, a static "10k/100k" petitions info card, and the 12-link sponsor "search elsewhere" block. Commit `91388ab`.
4. **Security audit and hardening ahead of sharing the site publicly** -- fixed a fail-open auth check in `/api/cron/refresh` (missing `CRON_SECRET` used to skip auth entirely instead of denying), fixed a domain-allowlist bug in `NewsDashboard.tsx` (bare `gov.uk`/`parliament.uk` entries let lookalike domains like `notgov.uk` pass as official), added security headers (CSP, X-Frame-Options, etc.) via `vercel.json`, and added per-IP rate limiting on `/api/sponsor-status` and `/api/simplify`. Commit `91388ab`.
5. **Added Vercel Web Analytics** so traffic/engagement is visible in the Vercel dashboard. Commit `91388ab`.
6. **Fixed a modal rendering behind the header on click** -- the detail modal in `NewsDashboard.tsx` was nested inside `<main>`, which has `relative z-10`; that caps everything inside it below the header's `sticky z-50` regardless of the modal's own `z-[9999]`, since z-index only compares within the same stacking context. Rendered the modal via a portal to `document.body` instead. While sweeping for the same class of bug, found the modal's content grid also overflowed horizontally on mobile (`grid md:grid-cols-3` with no base column count skips Tailwind's `minmax(0,1fr)` overflow protection) -- same latent pattern existed in three more places (App.tsx footer, two grids in PetitionTracker.tsx), fixed all four. Commit `89ce474`.

### Current state
- All three commits (`cf7420a`, `91388ab`, `89ce474`) pushed to main and deployed to Vercel; each verified live after deploy (curl checks against the real API, Playwright checks against the real UI, DOM measurements confirming no overflow).
- `CRON_SECRET` confirmed set in Vercel's environment variables by the user, so the fail-open fix doesn't break the nightly cron.
- Sponsor search, petitions tracker, security headers, rate limiting, and analytics are all live in production right now.
- Untracked remain by choice: `HANDOFF.md` and `.github/workflows/deploy.yml` -- the CI/CD decision from 2026-06-08 is still open.

### Next steps
1. Share the site publicly now that security hardening and analytics are in place -- this was the explicit trigger for this session's hardening work.
2. Check whether the GCP Cloud Run deployment from `.github/workflows/deploy.yml` is still live -- it would be running the now-deleted `gcp-worker/` code with `--allow-unauthenticated`, a second unmonitored production surface. Decommission if so.
3. Decide on `.github/workflows/deploy.yml` itself -- long-standing open item from 2026-06-08, still not resolved.
4. Once a few days of real traffic accumulate, the petitions signature-history snapshot (`petition-signature-history` in Redis) will have enough data points to show a real day-over-day trend line instead of just today's snapshot bar chart.

### Gotchas
- Vercel's filesystem-based routing beats `vercel.json` rewrites: if a literal file exists at `api/<name>.ts`, requests go there directly and never reach the rewrite target, even if the rewrite rule would otherwise match. Confirmed via edge cache headers unique to the direct file. This is why `initCache()` in `server.js` never ran for `/api/sponsor-status` in production.
- Tailwind's `grid-cols-N` utilities generate `minmax(0, 1fr)` tracks specifically to stop content from forcing a grid wider than its container. A bare `grid` class with only a `md:grid-cols-N` (no base `grid-cols-1`) skips that safety net below the `md` breakpoint entirely, and grid items' default `min-width: auto` lets content blow out the container. Always set the base column count explicitly, even when it's just 1.

## Latest session (2026-07-04, night) -- sponsor checker rebuild: local-only search, entity matching, historical ledger

### What was done
1. **Rebuilt the tiered search pipeline** -- exact match, normalised-exact (strips Ltd/LLP/plc), word-boundary-safe substring, word-overlap, and edit-distance fuzzy matching, in that order with early return. Fixed two bugs that rejected typos and short acronyms (BT, IBM, HSBC) outright. Fixed a false-positive class where raw substring checks matched inside unrelated words ("tesco" matching "atesco").
2. **Stopped auto-resolving fuzzy matches to a confirmed identity, ever** -- even a single strong candidate isn't safe (Johnson & Johnson Ltd vs ...Medical Ltd; "Saltlake" vs an unrelated dental practice were both real conflation incidents found during testing). Any non-exact match now surfaces a "possible matches" picker tagged Licensed/Revoked instead of guessing.
3. **Replaced the AI web-search fallback with a pre-fetched historical ledger** -- licensed-sponsors-uk.com's scraped GOV.UK add/remove history, bucketed by company-name prefix (676 buckets, ~30MB raw text). Gives exact revocation dates instead of AI guesses, which often turned up nothing for smaller companies GOV.UK never named publicly (e.g. "Larzu Techno Ltd"). Added a revoked-company index (18k+ entries) so half-word searches surface revoked entities too, not just active ones.
4. **Removed all live calls from the search path** -- checkSponsor no longer makes an AI call or a live third-party fetch under any circumstance. The ledger is pre-fetched nightly (and once at boot if stale) via a separate background job; search only ever reads from that cache. Typo'd searches now run in single-digit milliseconds against the 142k-row register.
5. **Nightly ledger refresh is now diff-based** -- reconciles all 676 buckets against what's cached and only rewrites the ones that actually changed, instead of overwriting all of them every night regardless of content.
6. **Fixed silent data loss for multi-route companies** -- 10.6% of the register (13,449 companies) sponsor under more than one route; the CSV has one row per route and the old exact-match lookup only returned the first, silently dropping the rest (Capgemini showed 1 of 3 routes). Also fixed the rating regex, which looked for "Grade A" text that doesn't exist in the CSV (actual format is "A rating") and so always returned "Unknown".
7. **Added conversational-query and typo tolerance** -- strips filler wrapping ("is tesco a real company", "does amazon sponsor visas", "the X company") before retrying a failed search, and added a word-level fuzzy tier so a typo on a short brand name ("tescoo") matches against individual words in a longer canonical name, not just the whole string. Required a first-letter prefilter and memoised canonical-name computation to keep this under 10ms per query (first version took ~1.7s per typo without them).
8. **Dropped the CSV register from the shared cache** -- the parsed register is ~24MB, over Upstash's 10MB free-tier request limit; persisting it would fail silently every cold start for no benefit. Kept ledger-bucket caching, which is small enough per-bucket to be safe.
9. **Committed and pushed** -- commit `bac2c9a`, pushed to main.

### Current state
- Live search logic is entirely local: current register (in-memory, refreshed nightly) + historical ledger (cached, diff-refreshed nightly). No AI dependency for sponsor checking at all.
- Verified against ~30 randomly sampled real companies (active and revoked, pulled fresh from the live CSV and ledger, not hand-picked) plus a ~50-case scenario matrix covering typos, half-words, security-adjacent input, unicode, and natural-language phrasing. All passed after fixes.
- Pushed to main; Vercel will auto-deploy. Not yet verified live on the deployed URL this session -- local testing only.
- Untracked remain by choice: this file and `.github/workflows/deploy.yml` -- the CI/CD decision from 2026-06-08 is still open.

### Next steps
1. Verify the deploy on `https://uk-immigration-compass.vercel.app` once Vercel finishes building -- confirm the nightly cron (`/api/cron/refresh`, now `maxDuration: 300`) actually completes and the ledger primes correctly on a cold Vercel instance, not just locally.
2. Confirm the Vercel plan supports `maxDuration: 300` on the cron function -- Hobby caps at 60s regardless of config; if the cron gets killed mid-run, the ledger will never fully prime in production.
3. Items 1-3 from the 2026-06-08 entry still stand (redeploy GCP worker, decide on deploy.yml).

## Latest session (2026-06-11) -- repo hygiene sweep

### What was done
1. **Archived untracked junk** -- 26 root screenshots, `fix_config.ps1`, `# Code Citations.md`, and `.playwright-mcp/` logs moved to `my-EA/archives/repo-cleanup/uk-immigration-compass/`. Nothing deleted.
2. **Added artifact guards to .gitignore** -- root-anchored `/*.png`, `/*.jpeg`, `/*.jpg` plus `.playwright-mcp/`, so verification screenshots stop accumulating. Commit `62fbc97`, pushed to main (Vercel auto-deploys; change is ignore rules only, no runtime impact).

### Current state
- Untracked remain by choice: `HANDOFF.md` (this file) and `.github/workflows/deploy.yml` -- the CI/CD decision from the 2026-06-08 entry is still open.
- The "clean up screenshot files" next-step from the 2026-06-08 entry is now done.

### Next steps
1. Items 1-3 from the 2026-06-08 entry still stand (verify Vercel deploy, redeploy GCP worker, decide on deploy.yml).

## Latest session (2026-06-08, evening) -- header logo icon and COMPASS alignment fix

### What was done
1. **Replaced ShieldCheck icon with Landmark** -- the shield-with-check glyph was off-theme. Swapped to the Landmark icon (parliament/government building) in both the header and footer logo lockups. Commit `9605906`.
2. **Fixed COMPASS subtitle alignment** -- the blue COMPASS line was drifting visually right due to inline rendering and `tracking-wide` trailing whitespace. Wrapped the text block in `flex flex-col justify-center`, made the span a `block` element, switched to `leading-tight` on both lines, and tightened letter-spacing to `tracking-[0.18em]`. Commit `9605906`.
3. **Renamed Employers nav label to Sponsors** -- a carry-over change from the previous session, included in the same commit.
4. **Added Vite dev proxy for /api** -- `vite.config.ts` now proxies `/api` to `http://localhost:10000` so the local dev server can reach the Express API. Included in commit `9605906`.
5. **Verified locally** -- dev server started on port 5175, user confirmed the result looked good in their browser.

### Current state
- Live at `https://uk-immigration-compass.vercel.app` -- Vercel auto-deploys from main, so the Landmark icon and alignment fix will be live shortly after the push
- All App.tsx and vite.config.ts changes are committed and pushed to main (commit `9605906`)
- GCP Cloud Function in `gcp-worker/` is still not redeployed (outstanding from previous sessions)
- Untracked files in root: screenshots, `.github/workflows/deploy.yml`, `HANDOFF.md`, and misc files -- not yet committed

### Next steps
1. Confirm Vercel deploy of `9605906` completes and the Landmark icon + COMPASS alignment look correct on the live site.
2. Redeploy the GCP Cloud Function from `gcp-worker/` to pick up the `index.js` / `retrieval.js` rewrites.
3. Commit or delete `.github/workflows/deploy.yml` -- decide if CI/CD via GitHub Actions is wanted.
4. Clean up screenshot files from the repo root (add to `.gitignore` or delete).

## Latest session (2026-06-08, evening) -- full rename to UK Immigration Compass

### What was done
1. **Confirmed code already uses the correct name** -- `index.html`, `metadata.json`, `package.json`, `App.tsx`, and `services/aiService.ts` all already reference "UK Immigration Compass". No source edits were needed.
2. **Renamed the GitHub repo** -- `VarunDasharadhi/Immigration-Sponsor-Updates` renamed to `VarunDasharadhi/uk-immigration-compass` via GitHub Settings. GitHub auto-redirects the old URL.
3. **Updated the local git remote** -- `git remote set-url origin https://github.com/VarunDasharadhi/uk-immigration-compass.git`.
4. **Renamed the Vercel project** -- Project renamed from `immigration-sponsor-updates` to `uk-immigration-compass` in Vercel Settings. Dashboard URL is now `vercel.com/team-viper/uk-immigration-compass`.
5. **Updated the production domain** -- Primary domain changed to `uk-immigration-compass.vercel.app`. Old domain `immigration-sponsor-updates.vercel.app` kept as a 307 redirect so existing links still work.
6. **Updated HANDOFF.md** -- Live URL reference updated to `https://uk-immigration-compass.vercel.app`.

### Current state
- Live at `https://uk-immigration-compass.vercel.app` (old URL redirects with 307)
- GitHub repo is `VarunDasharadhi/uk-immigration-compass`, local remote matches
- `App.tsx` and `vite.config.ts` still modified locally but not yet committed (from previous session)
- Local folder is still named `Immigration-Sponsor-Updates` -- rename is manual (must close VSCode first)

### Next steps
1. Rename local folder: close VSCode, run `Rename-Item "c:\Users\varun\repos\Immigration-Sponsor-Updates" "uk-immigration-compass"`, reopen workspace.
2. Commit and push `App.tsx` (Sponsors tab rename) and `vite.config.ts` (dev proxy config).
3. Redeploy the GCP Cloud Function from `gcp-worker/` to pick up the `index.js` / `retrieval.js` rewrites.
4. Decide on `.github/workflows/deploy.yml`: commit or delete.
5. Clean up screenshot files from repo root (add to `.gitignore` or delete).

## Latest session (2026-06-08, evening) -- nav rename and local dev proxy

### What was done
1. **Renamed "Employers" nav tab to "Sponsors"** -- single label change in `App.tsx` line 41.
2. **Fixed local dev data not loading** -- Vite had no proxy for `/api/*`, so browser requests never reached the Express server. Added `proxy: { '/api': { target: 'http://localhost:10000' } }` to `vite.config.ts`. Express server runs on port 10000 via `npm run start` (uses `tsx`); Vite runs on port 3000.
3. **Decided to keep app name "UK Immigration Compass"** -- user considered renaming to "Immigration Updates" or "UK Immigration Tracker" but kept the current name on recommendation.

### Current state
- Local dev: Vite on port 3000 proxies `/api/*` to Express on port 10000. Both must be running for data to load.
- `App.tsx` and `vite.config.ts` modified locally but not yet committed.
- Deployed Vercel app unchanged from previous session (Redis-backed, sub-2s responses).

### Next steps
1. Commit and push `App.tsx` (Sponsors rename) and `vite.config.ts` (dev proxy).
2. Redeploy the GCP Cloud Function from `gcp-worker/` to pick up the `index.js` / `retrieval.js` rewrites.
3. Commit or delete `.github/workflows/deploy.yml` -- decide if CI/CD via GitHub Actions is wanted.
4. Add screenshots to `.gitignore` or delete them from the repo root.

## Latest session (2026-06-08, afternoon) -- Redis caching and Vercel cron

### What was done
1. **Diagnosed cold-start latency** -- Vercel serverless functions sleep between requests, so the midnight `setTimeout` scheduler in `aiService.ts` never fires. Every cold start was triggering a live OpenRouter AI call (30-45s wait).
2. **Added Upstash Redis via Vercel marketplace** -- Vercel's marketplace integration sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. `@upstash/redis` package added; `@vercel/kv` avoided (Vercel no longer ships a first-party KV product). Commit `39e6985`.
3. **Rewrote `services/cache.ts`** -- Two-layer cache: in-memory Map as L1, Redis as L2. `get()` and `set()` are now async. Falls back to disk file for local dev when `KV_REST_API_URL` is absent. Commit `58d8a33`.
4. **Updated `services/aiService.ts`** -- All `cache.get()` / `cache.set()` calls await-ed. `refreshUpdates`, `refreshPetitions`, `refreshSponsorNews` exported so the cron endpoint can call them directly.
5. **Added `/api/cron/refresh` endpoint** -- Protected by `CRON_SECRET` Bearer token. Returns 401 for missing or wrong token. Runs all three feed refreshes in parallel. Commit `39e6985`.
6. **Added Vercel Cron Job** -- `vercel.json` now schedules `0 0 * * *` UTC to hit `/api/cron/refresh`. Function max duration set to 120s. Commit `39e6985`.
7. **Seeded Redis on first deploy** -- Called the cron endpoint once manually with the correct secret to populate Redis immediately after deploy.
8. **Verified end-to-end** -- All three API endpoints respond in under 2s (down from 30-45s). Cron auth correctly returns 401 / 200. All four UI tabs (Home, News, Petitions, Employers/Sponsors) rendered correctly via Playwright.
9. **Overhauled gcp-worker** -- Rewrote `index.js` and `retrieval.js` to use current `@google/genai` SDK patterns. Expanded `.gcloudignore`. Commit `2ca3eee`.

### Current state
- Live on Vercel at `https://uk-immigration-compass.vercel.app`
- Redis is seeded and all three feeds return cached data in under 2s
- Vercel Cron is scheduled for midnight UTC -- no manual intervention needed
- `gcp-worker/` changes are committed and pushed but the Cloud Function is not yet redeployed to GCP
- Untracked files in root: screenshots from verification runs and `.github/workflows/deploy.yml` -- not yet committed

### Next steps
1. Redeploy the GCP Cloud Function from `gcp-worker/` to pick up the `index.js` / `retrieval.js` rewrites.
2. Commit or delete `.github/workflows/deploy.yml` -- decide if CI/CD via GitHub Actions is wanted.
3. Clean up screenshot files from the repo root (add to `.gitignore` or delete).
4. Monitor the first automatic midnight cron run in the Vercel dashboard (Cron Jobs tab) to confirm it fires and Redis is refreshed without manual intervention.
