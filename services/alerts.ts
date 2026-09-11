/**
 * alerts.ts
 * Double opt-in email alerts for immigration rule changes and sponsor
 * register movements.
 *
 * Storage: the same Upstash Redis instance the feed cache uses (one hash,
 * `alerts:subscribers`, field = lowercased email, value = subscriber record),
 * so there are no new Vercel functions or env vars for storage.
 * Sending: the Resend REST API via fetch (no SDK).
 *
 * Everything degrades to a no-op when Redis or RESEND_API_KEY is missing
 * (local dev without keys), matching the fallback pattern in cache.ts.
 *
 * SIMPLIFIED: confirm/unsubscribe are plain HTML responses from the API
 * rather than SPA routes; upgrade path is a hash route + banner in App.tsx.
 * Digest covers rule updates plus register movements only; sponsor news
 * items are deliberately left out to keep the email short.
 */

import crypto from 'crypto';
import { getRedisClient } from './cache.js';
import * as aiService from './aiService.js';
import { NewsItem, SponsorChangeItem } from '../types.js';
import type { Redis } from '@upstash/redis';

const SITE_URL = 'https://uk-immigration-compass.vercel.app';
const SITE_NAME = 'UK Immigration Compass';
const SUBSCRIBERS_KEY = 'alerts:subscribers';
const LAST_DIGEST_KEY = 'alerts:last-digest';
const MAX_UPDATES_PER_DIGEST = 6;
const MAX_CHANGES_PER_DIGEST = 6;
// Resend's free tier allows 100 emails per day; leave headroom for
// confirmation emails sent during the same window.
const MAX_RECIPIENTS_PER_RUN = 90;

// ─── subscriber records ──────────────────────────────────────────────────────

interface SubscriberRecord {
  status: 'pending' | 'confirmed';
  token: string;
  subscribedAt: string;
}

interface StoredSubscriber extends SubscriberRecord {
  email: string;
}

function parseRecord(raw: unknown): SubscriberRecord | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.status === 'pending' || parsed.status === 'confirmed') && typeof parsed.token === 'string') {
      return parsed;
    }
  } catch {
    // Corrupt entry behaves like an absent one
  }
  return null;
}

export function alertsConfigured(): boolean {
  return Boolean(getRedisClient() && process.env.RESEND_API_KEY);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(raw: string): boolean {
  const email = normaliseEmail(raw);
  return email.length >= 6 && email.length <= 254 && EMAIL_RE.test(email);
}

function normaliseEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

function newToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

// ─── Resend ──────────────────────────────────────────────────────────────────

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

async function sendEmail(to: string, content: EmailContent): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  // Resend's sandbox sender only reaches the account owner's inbox; set
  // ALERTS_FROM_EMAIL once a sending domain is verified.
  const from = process.env.ALERTS_FROM_EMAIL || `${SITE_NAME} <onboarding@resend.dev>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject: content.subject, html: content.html, text: content.text }),
    });
    if (!res.ok) {
      console.error(`[Alerts] Resend rejected email to ${to}: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Alerts] Resend request failed for ${to}:`, err);
    return false;
  }
}

// Shared outer wrapper for alert emails; email clients need inline styles
// (most strip <style> blocks), so everything is styled inline.
function emailShell(title: string, bodyHtml: string, footerHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
            <tr>
              <td style="background:#16243d;padding:20px 28px;">
                <span style="color:#ffffff;font-size:16px;font-weight:bold;">${SITE_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;">${title}</h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">${footerHtml}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function linkStyle(): string {
  return 'color:#1d4ed8;';
}

export function buildConfirmationEmail(confirmUrl: string): EmailContent {
  const title = 'Confirm your email alerts';
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">
      Someone signed this email address up for change alerts from ${SITE_NAME}.
      Confirm below and we will send one short email a day, and only on days
      when something actually changes.
    </p>
    <p style="margin:0 0 20px;">
      <a href="${confirmUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 24px;border-radius:8px;">Confirm my subscription</a>
    </p>
    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
      If the button does not work, paste this link into your browser:<br>
      <a href="${confirmUrl}" style="${linkStyle()}">${confirmUrl}</a>
    </p>`;
  const footer = `You are receiving this because someone used this address on ${SITE_NAME}.
    If it was not you, ignore this email and nothing further will happen.`;
  return {
    subject: `Confirm your ${SITE_NAME} email alerts`,
    html: emailShell(title, body, footer),
    text: [
      `Confirm your ${SITE_NAME} email alerts`,
      '',
      'Someone signed this email address up for change alerts from UK Immigration Compass.',
      'Confirm here:',
      confirmUrl,
      '',
      'If it was not you, ignore this email and nothing further will happen.',
    ].join('\n'),
  };
}

// ─── digest content ──────────────────────────────────────────────────────────

export interface DigestSelection {
  updates: NewsItem[];
  changes: SponsorChangeItem[];
}

/** Newest-first picks of everything that happened after `sinceMs`, capped. */
export function selectDigestItems(updates: NewsItem[], changes: SponsorChangeItem[], sinceMs: number): DigestSelection {
  const freshUpdates = updates
    .filter(u => Number(u.parsedDate) > sinceMs)
    .sort((a, b) => b.parsedDate - a.parsedDate)
    .slice(0, MAX_UPDATES_PER_DIGEST);
  const freshChanges = changes
    .filter(c => {
      const ts = Date.parse(c.date);
      return Number.isFinite(ts) && ts > sinceMs;
    })
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, MAX_CHANGES_PER_DIGEST);
  return { updates: freshUpdates, changes: freshChanges };
}

function digestSubject(sel: DigestSelection): string {
  const parts: string[] = [];
  if (sel.updates.length > 0) parts.push(`${sel.updates.length} rule update${sel.updates.length === 1 ? '' : 's'}`);
  if (sel.changes.length > 0) parts.push(`${sel.changes.length} sponsor register change${sel.changes.length === 1 ? '' : 's'}`);
  return `${SITE_NAME}: ${parts.join(', ')}`;
}

function digestItemHtml(label: string, title: string, date: string): string {
  return `
      <li style="margin:0 0 10px;">
        <span style="display:inline-block;font-size:10px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:2px 6px;">${label}</span>
        <p style="margin:6px 0 0;font-size:14px;color:#0f172a;line-height:1.5;">${title}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#64748b;">${date}</p>
      </li>`;
}

export function buildDigestEmail(sel: DigestSelection, unsubscribeUrl: string): EmailContent {
  const sections: string[] = [];
  if (sel.updates.length > 0) {
    sections.push(`
      <h2 style="margin:0 0 12px;font-size:15px;color:#0f172a;">Rule and policy updates</h2>
      <ul style="margin:0;padding:0 0 0 4px;list-style:none;">${sel.updates
        .map(u => digestItemHtml(u.category, escapeHtml(u.title), escapeHtml(u.date)))
        .join('')}
      </ul>`);
  }
  if (sel.changes.length > 0) {
    sections.push(`
      <h2 style="margin:20px 0 12px;font-size:15px;color:#0f172a;">Sponsor register movements</h2>
      <ul style="margin:0;padding:0 0 0 4px;list-style:none;">${sel.changes
        .map(c => digestItemHtml(c.type === 'added' ? 'Added' : 'Removed', `${escapeHtml(c.company)} (${escapeHtml(c.town)})`, escapeHtml(c.date)))
        .join('')}
      </ul>`);
  }
  const body = `
    <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.6;">
      Here is what changed since the last alert. Full details are on the site.
    </p>
    ${sections.join('\n')}
    <p style="margin:24px 0 0;">
      <a href="${SITE_URL}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 24px;border-radius:8px;">Open UK Immigration Compass</a>
    </p>`;
  const footer = `You are receiving this because you asked for change alerts from ${SITE_NAME}.
    <a href="${unsubscribeUrl}" style="color:#64748b;">Unsubscribe</a> any time.`;
  const textLines: string[] = [
    'Here is what changed since the last alert. Full details: ' + SITE_URL,
    '',
  ];
  if (sel.updates.length > 0) {
    textLines.push('RULE AND POLICY UPDATES');
    for (const u of sel.updates) textLines.push(`- [${u.category}] ${u.title} (${u.date})`);
    textLines.push('');
  }
  if (sel.changes.length > 0) {
    textLines.push('SPONSOR REGISTER MOVEMENTS');
    for (const c of sel.changes) textLines.push(`- [${c.type}] ${c.company} (${c.town}) (${c.date})`);
    textLines.push('');
  }
  textLines.push(`Unsubscribe: ${unsubscribeUrl}`);
  return {
    subject: digestSubject(sel),
    html: emailShell('What changed', body, footer),
    text: textLines.join('\n'),
  };
}

// Item titles and company names come from AI-generated or register-sourced
// text, so escape them before they go into the HTML email.
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── subscribe / confirm / unsubscribe ───────────────────────────────────────

export interface AlertsResult {
  ok: boolean;
  code: number;
  message: string;
}

const NOT_CONFIGURED: AlertsResult = {
  ok: false,
  code: 503,
  message: 'Email alerts are not available right now. Please try again later.',
};

async function readSubscriber(redis: Redis, email: string): Promise<SubscriberRecord | null> {
  return parseRecord(await redis.hget(SUBSCRIBERS_KEY, email));
}

export async function subscribe(rawEmail: string): Promise<AlertsResult> {
  const email = normaliseEmail(rawEmail);
  if (!isValidEmail(email)) {
    return { ok: false, code: 400, message: 'Enter a valid email address.' };
  }
  const redis = getRedisClient();
  if (!redis || !process.env.RESEND_API_KEY) return NOT_CONFIGURED;

  const existing = await readSubscriber(redis, email);
  if (existing?.status === 'confirmed') {
    return { ok: true, code: 200, message: 'This address is already on the list.' };
  }

  const token = existing?.token ?? newToken();
  if (!existing) {
    const record: SubscriberRecord = { status: 'pending', token, subscribedAt: new Date().toISOString() };
    const created = await redis.hsetnx(SUBSCRIBERS_KEY, email, JSON.stringify(record));
    if (!created) {
      // Lost a race with a parallel subscribe; re-read and treat as repeat.
      const raced = await readSubscriber(redis, email);
      if (raced?.status === 'confirmed') {
        return { ok: true, code: 200, message: 'This address is already on the list.' };
      }
      return sendConfirmation(email, raced?.token ?? token);
    }
  }
  return sendConfirmation(email, token);
}

function sendConfirmation(email: string, token: string): Promise<AlertsResult> {
  const confirmUrl = `${SITE_URL}/api/alerts/confirm?token=${encodeURIComponent(token)}`;
  return sendEmail(email, buildConfirmationEmail(confirmUrl)).then(sent =>
    sent
      ? { ok: true, code: 200, message: 'Check your inbox and click the confirm link to finish subscribing.' }
      : { ok: false, code: 502, message: 'We could not send the confirmation email. Please try again later.' }
  );
}

async function findByToken(redis: Redis, token: string): Promise<{ email: string; record: SubscriberRecord } | null> {
  if (!token) return null;
  const all = (await redis.hgetall<Record<string, string>>(SUBSCRIBERS_KEY)) || {};
  for (const [email, raw] of Object.entries(all)) {
    const record = parseRecord(raw);
    if (record && record.token === token) return { email, record };
  }
  return null;
}

export async function confirmSubscriber(token: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  const found = await findByToken(redis, token);
  if (!found || found.record.status === 'confirmed') return Boolean(found);
  await redis.hset(SUBSCRIBERS_KEY, { [found.email]: JSON.stringify({ ...found.record, status: 'confirmed' }) });
  return true;
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  const found = await findByToken(redis, token);
  if (!found) return false;
  await redis.hdel(SUBSCRIBERS_KEY, found.email);
  return true;
}

// ─── daily digest (called from the refresh cron) ─────────────────────────────

async function getConfirmedSubscribers(redis: Redis): Promise<StoredSubscriber[]> {
  const all = (await redis.hgetall<Record<string, string>>(SUBSCRIBERS_KEY)) || {};
  const confirmed: StoredSubscriber[] = [];
  for (const [email, raw] of Object.entries(all)) {
    const record = parseRecord(raw);
    if (record?.status === 'confirmed') confirmed.push({ ...record, email });
  }
  return confirmed;
}

export async function sendDigestIfDue(): Promise<{ sent: number; skipped?: string }> {
  const redis = getRedisClient();
  if (!redis) return { sent: 0, skipped: 'no-redis' };
  if (!process.env.RESEND_API_KEY) return { sent: 0, skipped: 'no-resend' };

  const sinceRaw = await redis.get<string>(LAST_DIGEST_KEY);
  const since = sinceRaw ? Number(sinceRaw) : 0;

  const [updatesRes, changes] = await Promise.all([
    aiService.getUpdates().catch(err => {
      console.error('[Alerts] Digest could not load updates:', err);
      return null;
    }),
    aiService.getRecentSponsorChanges().catch(err => {
      console.error('[Alerts] Digest could not load sponsor changes:', err);
      return [] as SponsorChangeItem[];
    }),
  ]);
  const sel = selectDigestItems(updatesRes?.items ?? [], changes, Number.isFinite(since) ? since : 0);

  if (sel.updates.length === 0 && sel.changes.length === 0) {
    await redis.set(LAST_DIGEST_KEY, String(Date.now()));
    return { sent: 0, skipped: 'nothing-new' };
  }
  const subscribers = await getConfirmedSubscribers(redis);
  if (subscribers.length === 0) {
    await redis.set(LAST_DIGEST_KEY, String(Date.now()));
    return { sent: 0, skipped: 'no-subscribers' };
  }
  if (subscribers.length > MAX_RECIPIENTS_PER_RUN) {
    console.warn(`[Alerts] ${subscribers.length} subscribers but only ${MAX_RECIPIENTS_PER_RUN} emails sent this run; the rest catch up next digest.`);
  }

  let sent = 0;
  for (const subscriber of subscribers.slice(0, MAX_RECIPIENTS_PER_RUN)) {
    const unsubscribeUrl = `${SITE_URL}/api/alerts/unsubscribe?token=${encodeURIComponent(subscriber.token)}`;
    const okSend = await sendEmail(subscriber.email, buildDigestEmail(sel, unsubscribeUrl));
    if (okSend) sent++;
  }
  // Advance the watermark only once something actually went out, so a total
  // send failure (unverified domain, API outage) retries tomorrow with the
  // same items rather than silently skipping them.
  if (sent > 0) await redis.set(LAST_DIGEST_KEY, String(Date.now()));
  return { sent };
}

// ─── minimal HTML pages for email link clicks ────────────────────────────────
// Inline styles are avoided because the site CSP (style-src 'self') applies
// to API responses too; plain unstyled markup keeps those pages working.

function responsePage(title: string, message: string): string {
  return `<!doctype html>
<html lang="en-GB">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | ${SITE_NAME}</title></head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${message}</p>
<p><a href="${SITE_URL}">Back to ${SITE_NAME}</a></p>
</body>
</html>`;
}

const CONFIRMED_PAGE = responsePage(
  'Subscription confirmed',
  'You are on the list. On days when rules or the sponsor register change, we will send you one short email.'
);
const BAD_TOKEN_PAGE = responsePage(
  'Link no longer valid',
  'This link has already been used or the subscription no longer exists.'
);
const UNSUBSCRIBED_PAGE = responsePage(
  'Unsubscribed',
  'You will not receive any more alerts. If you change your mind, you can sign up again on the site.'
);

export function confirmationPage(): string {
  return CONFIRMED_PAGE;
}

export function invalidTokenPage(): string {
  return BAD_TOKEN_PAGE;
}

export function unsubscribePage(): string {
  return UNSUBSCRIBED_PAGE;
}
