import {
  alertsConfigured,
  buildConfirmationEmail,
  buildDigestEmail,
  confirmSubscriber,
  isValidEmail,
  selectDigestItems,
  sendDigestIfDue,
  subscribe,
  unsubscribeByToken,
} from './alerts';
import { NewsItem, SponsorChangeItem } from '../types';

jest.mock('./cache.js', () => ({
  getRedisClient: jest.fn(),
}));

jest.mock('./aiService.js', () => ({
  getUpdates: jest.fn(),
  getRecentSponsorChanges: jest.fn(),
}));

import { getRedisClient } from './cache';
import * as aiService from './aiService';

const getRedisClientMock = getRedisClient as jest.Mock;
const getUpdatesMock = aiService.getUpdates as jest.Mock;
const getRecentSponsorChangesMock = aiService.getRecentSponsorChanges as jest.Mock;

function makeRedis() {
  return {
    hget: jest.fn().mockResolvedValue(null),
    hsetnx: jest.fn().mockResolvedValue(1),
    hset: jest.fn().mockResolvedValue(1),
    hdel: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  };
}

function fetchOk() {
  return jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' } as unknown as Response);
}

const TOKEN = 'tok_abc123';

function pendingRecord(token = TOKEN) {
  return JSON.stringify({ status: 'pending', token, subscribedAt: '2026-09-11T00:00:00.000Z' });
}

const SINCE = 1_700_000_000_000;

function makeUpdate(daysAfter: number, title = 'Skilled Worker salary threshold changes'): NewsItem {
  return {
    id: `u-${daysAfter}`,
    title,
    status: 'In force',
    date: '2026-09-10',
    parsedDate: SINCE + daysAfter * 86_400_000,
    category: 'Work',
    summary: '',
    details: '',
    impact: '',
    sources: [],
  } as unknown as NewsItem;
}

const CHANGE: SponsorChangeItem = { company: 'Acme Ltd', town: 'Leeds', type: 'added', date: '2026-09-10' };

describe('alerts: validation and configuration', () => {
  it('accepts ordinary addresses and rejects junk', () => {
    expect(isValidEmail('reader@example.co.uk')).toBe(true);
    expect(isValidEmail('  Reader@Example.COM ')).toBe(true); // normalises, not validates raw case
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('missing-tld@')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('reports configured only when both Redis and a Resend key exist', () => {
    getRedisClientMock.mockReturnValue(makeRedis());
    process.env.RESEND_API_KEY = 're_test';
    expect(alertsConfigured()).toBe(true);
    delete process.env.RESEND_API_KEY;
    expect(alertsConfigured()).toBe(false);
    getRedisClientMock.mockReturnValue(null);
    expect(alertsConfigured()).toBe(false);
  });
});

describe('alerts: subscribe', () => {
  let redis: ReturnType<typeof makeRedis>;
  let send: jest.Mock;

  beforeEach(() => {
    redis = makeRedis();
    getRedisClientMock.mockReturnValue(redis);
    process.env.RESEND_API_KEY = 're_test';
    send = fetchOk();
    global.fetch = send as unknown as typeof fetch;
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it('rejects an invalid address with 400 and sends nothing', async () => {
    const result = await subscribe('not-an-email');
    expect(result.ok).toBe(false);
    expect(result.code).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns 503 when storage or sending is not configured', async () => {
    getRedisClientMock.mockReturnValue(null);
    const result = await subscribe('reader@example.com');
    expect(result.code).toBe(503);
  });

  it('stores a pending record and emails a confirmation link for a new address', async () => {
    const result = await subscribe('Reader@Example.com');

    expect(result.ok).toBe(true);
    const [key, field, value] = redis.hsetnx.mock.calls[0];
    expect(key).toBe('alerts:subscribers');
    expect(field).toBe('reader@example.com');
    const record = JSON.parse(value);
    expect(record.status).toBe('pending');
    expect(record.token).toBeTruthy();

    expect(send).toHaveBeenCalledTimes(1);
    const body = JSON.parse((send.mock.calls[0][1] as RequestInit).body as string);
    expect(body.to).toEqual(['reader@example.com']);
    expect(body.html).toContain(encodeURIComponent(record.token));
  });

  it('tells an already-confirmed subscriber they are on the list and sends nothing', async () => {
    redis.hget.mockResolvedValue(JSON.stringify({ status: 'confirmed', token: TOKEN, subscribedAt: '2026-09-01T00:00:00.000Z' }));
    const result = await subscribe('reader@example.com');
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/already/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('resends the confirmation for an address that never confirmed', async () => {
    redis.hget.mockResolvedValue(pendingRecord());
    const result = await subscribe('reader@example.com');
    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(redis.hsetnx).not.toHaveBeenCalled();
  });
});

describe('alerts: confirm and unsubscribe', () => {
  let redis: ReturnType<typeof makeRedis>;

  beforeEach(() => {
    redis = makeRedis();
    getRedisClientMock.mockReturnValue(redis);
  });

  it('flips a pending record to confirmed by token', async () => {
    redis.hgetall.mockResolvedValue({ 'reader@example.com': pendingRecord() });
    expect(await confirmSubscriber(TOKEN)).toBe(true);
    const [key, fields] = redis.hset.mock.calls[0];
    expect(key).toBe('alerts:subscribers');
    expect(JSON.parse(fields['reader@example.com']).status).toBe('confirmed');
  });

  it('is idempotent for an already-confirmed token and rejects an unknown one', async () => {
    redis.hgetall.mockResolvedValue({
      'reader@example.com': JSON.stringify({ status: 'confirmed', token: TOKEN, subscribedAt: 'x' }),
    });
    expect(await confirmSubscriber(TOKEN)).toBe(true);
    expect(redis.hset).not.toHaveBeenCalled();

    expect(await confirmSubscriber('nope')).toBe(false);
    expect(await confirmSubscriber('')).toBe(false);
  });

  it('matches tokens when Upstash hands back auto-deserialized objects instead of strings', async () => {
    // The upstash REST client JSON-parses stored values on read; production
    // hash reads arrive as objects, not the strings our writes sent.
    redis.hgetall.mockResolvedValue({
      'reader@example.com': { status: 'pending', token: TOKEN, subscribedAt: 'x' },
    });
    expect(await confirmSubscriber(TOKEN)).toBe(true);
    expect(redis.hset).toHaveBeenCalledWith('alerts:subscribers', {
      'reader@example.com': expect.stringContaining('"status":"confirmed"'),
    });

    redis.hset.mockClear();
    expect(await unsubscribeByToken(TOKEN)).toBe(true);
    expect(redis.hdel).toHaveBeenCalledWith('alerts:subscribers', 'reader@example.com');
  });

  it('removes the subscriber on unsubscribe and reports unknown tokens', async () => {
    redis.hgetall.mockResolvedValue({ 'reader@example.com': pendingRecord() });
    expect(await unsubscribeByToken(TOKEN)).toBe(true);
    expect(redis.hdel).toHaveBeenCalledWith('alerts:subscribers', 'reader@example.com');

    expect(await unsubscribeByToken('gone')).toBe(false);
  });
});

describe('alerts: digest selection and email', () => {
  it('keeps only items newer than the watermark, newest first, capped', () => {
    const updates = [makeUpdate(1), makeUpdate(3, 'Newest rule'), makeUpdate(-1, 'Already sent')];
    const changes: SponsorChangeItem[] = [
      { ...CHANGE, date: new Date(SINCE + 2 * 86_400_000).toISOString().slice(0, 10) },
      { ...CHANGE, company: 'Old Ltd', date: '1999-01-01' },
      { ...CHANGE, company: 'Bad date Ltd', date: 'not-a-date' },
    ];
    const sel = selectDigestItems(updates, changes, SINCE);

    expect(sel.updates.map(u => u.title)).toEqual(['Newest rule', 'Skilled Worker salary threshold changes']);
    expect(sel.changes).toHaveLength(1);
    expect(sel.changes[0].company).toBe('Acme Ltd');
  });

  it('builds an email with both sections, an unsubscribe link, escaped titles, and no em dashes', () => {
    const tricky = makeUpdate(1, 'Salary <rules> & "thresholds" updated');
    const sel = selectDigestItems([tricky], [CHANGE], SINCE);
    const { subject, html, text } = buildDigestEmail(sel, 'https://example.com/unsub?token=t');

    expect(subject).toContain('1 rule update');
    expect(subject).toContain('1 sponsor register change');
    expect(html).toContain('Salary &lt;rules&gt; &amp; &quot;thresholds&quot; updated');
    expect(html).toContain('https://example.com/unsub?token=t');
    expect(html).toContain('Acme Ltd');
    expect(html).not.toContain('\u2014');
    expect(text).toContain('Acme Ltd');
    expect(text).toContain('https://example.com/unsub?token=t');
    expect(text).not.toContain('\u2014');
  });

  it('builds a confirmation email containing the link and no em dashes', () => {
    const { subject, html, text } = buildConfirmationEmail('https://example.com/confirm?token=t');
    expect(subject).toMatch(/confirm/i);
    expect(html).toContain('https://example.com/confirm?token=t');
    expect(text).toContain('https://example.com/confirm?token=t');
    expect(html).not.toContain('\u2014');
  });
});

describe('alerts: sendDigestIfDue', () => {
  let redis: ReturnType<typeof makeRedis>;
  let send: jest.Mock;

  beforeEach(() => {
    redis = makeRedis();
    getRedisClientMock.mockReturnValue(redis);
    process.env.RESEND_API_KEY = 're_test';
    send = fetchOk();
    global.fetch = send as unknown as typeof fetch;
    getUpdatesMock.mockResolvedValue({ items: [makeUpdate(1)] });
    getRecentSponsorChangesMock.mockResolvedValue([CHANGE]);
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it('is a no-op without Redis or a Resend key', async () => {
    getRedisClientMock.mockReturnValue(null);
    expect((await sendDigestIfDue()).skipped).toBe('no-redis');

    getRedisClientMock.mockReturnValue(redis);
    delete process.env.RESEND_API_KEY;
    expect((await sendDigestIfDue()).skipped).toBe('no-resend');
    expect(send).not.toHaveBeenCalled();
  });

  it('advances the watermark and sends nothing when there is nothing new', async () => {
    getUpdatesMock.mockResolvedValue({ items: [makeUpdate(-1)] });
    getRecentSponsorChangesMock.mockResolvedValue([]);
    redis.get.mockResolvedValue(String(SINCE));

    const result = await sendDigestIfDue();
    expect(result.skipped).toBe('nothing-new');
    expect(redis.set).toHaveBeenCalledWith('alerts:last-digest', expect.any(String));
    expect(send).not.toHaveBeenCalled();
  });

  it('advances the watermark when nobody is subscribed yet', async () => {
    redis.get.mockResolvedValue(String(SINCE));
    const result = await sendDigestIfDue();
    expect(result.skipped).toBe('no-subscribers');
    expect(redis.set).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('emails each confirmed subscriber and advances the watermark', async () => {
    redis.get.mockResolvedValue(String(SINCE));
    redis.hgetall.mockResolvedValue({
      // Object shape: what Upstash actually returns for JSON hash values
      'a@example.com': { status: 'confirmed', token: 't-a', subscribedAt: 'x' },
      'b@example.com': pendingRecord('t-b'), // pending subscribers get nothing
    });

    const result = await sendDigestIfDue();
    expect(result.sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    const body = JSON.parse((send.mock.calls[0][1] as RequestInit).body as string);
    expect(body.to).toEqual(['a@example.com']);
    expect(body.html).toContain('t-a');
    expect(redis.set).toHaveBeenCalledWith('alerts:last-digest', expect.any(String));
  });

  it('keeps the watermark when every send fails so items are retried', async () => {
    redis.get.mockResolvedValue(String(SINCE));
    redis.hgetall.mockResolvedValue({
      'a@example.com': JSON.stringify({ status: 'confirmed', token: 't-a', subscribedAt: 'x' }),
    });
    send.mockResolvedValue({ ok: false, status: 403, text: async () => 'domain not verified' } as unknown as Response);

    const result = await sendDigestIfDue();
    expect(result.sent).toBe(0);
    expect(redis.set).not.toHaveBeenCalled();
  });
});
