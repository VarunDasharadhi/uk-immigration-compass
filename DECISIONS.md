# DECISIONS

Append-only, dated, one line per decision plus the why. Read before reopening a settled call.
Never rewrite or delete an existing dated line; if a decision is later reversed, append a new line
saying so rather than editing the old one.

## 2026-09-11

- 2026-09-11: Email alerts store subscribers in the existing shared Upstash Redis (one hash) and send through Resend, with no new Vercel function files; the signup and confirm/unsubscribe routes ride the api/index.ts catch-all and the digest rides the refresh cron. Why: api/ is at Vercel Hobby's 12-function cap, and reusing the wired Redis keeps new env vars at just the Resend pair.
- 2026-09-11: Alerts use double opt-in with one daily digest (watermark in Redis, capped at 6 updates + 6 register changes, max 90 recipients per run). Why: protects Resend's free-tier quota and deliverability; the watermark only advances after a successful send so a failed run retries rather than skips.
- 2026-09-11: Ko-fi footer button ships hidden behind an empty KOFI_URL constant in App.tsx. Why: no real Ko-fi URL exists anywhere yet and a guessed external link must not ship; one constant flip turns it on.
- 2026-09-11: Affiliate links: Adzuna added as the fourth open-roles destination, routed through AWIN's documented deep-link format when two source constants in utils/companyLinks.ts are filled; LinkedIn, Indeed and Google stay plain. Why: only Adzuna has an openly documented affiliate scheme; Indeed's is invite-only with an unverifiable link format, and import.meta env vars break ts-jest in jest-tested modules.
- 2026-09-11: Alerts deployed to production with Resend still on its sandbox sender. Why: Varun authorised the in-session deploy for verification; the sandbox only reaches the Resend account owner's inbox, so public signups fail honestly until a domain is verified and ALERTS_FROM_EMAIL set, and that trade was accepted knowingly.
- 2026-09-11: Verification of the live email loop uses the local gmail-mcp over its own stdio JSON-RPC (script in .tokensave/gmail-mcp-client.mjs) because that MCP server is attached to Claude Code, not ZCode. Why: no interactive Gmail login needed, and the token store the MCP already holds stays the single auth path.
