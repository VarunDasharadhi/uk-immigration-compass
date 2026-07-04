/**
 * Regression test for the "no updates on prod after the dark-mode merge" bug.
 *
 * The merge changed getUpdates()'s response shape from the old {text, sources}
 * to the new {items, sources}, but reused the same 'updates' cache key with no
 * version bump. Prod's Redis still held an old-format {text, sources} value, and
 * getUpdates() returned any cached value verbatim — so the client's result.items
 * was undefined and the feed rendered "No updates found".
 *
 * getUpdates() must not hand back a cached value that doesn't match the current
 * {items: NewsItem[]} contract.
 */

const mockCacheGet = jest.fn();

jest.mock('./cache.js', () => ({
  get: (...args: any[]) => mockCacheGet(...args),
  set: jest.fn().mockResolvedValue(undefined),
  setMany: jest.fn().mockResolvedValue(undefined),
  has: jest.fn().mockReturnValue(false),
  load: jest.fn(),
  ageMs: jest.fn().mockReturnValue(Infinity),
  getRedisClient: jest.fn().mockReturnValue(null),
}));

describe('getUpdates cache-shape guard', () => {
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    jest.resetModules();
    mockCacheGet.mockReset();
    // No API key → on a cache miss/invalid, getUpdates falls back to MOCK.updates
    // (which is correctly shaped) instead of making a live OpenRouter call.
    delete process.env.OPENROUTER_API_KEY;
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  });

  it('does not return a stale old-format {text, sources} cache value', async () => {
    // Simulate prod's stale cache: pre-merge shape, no `items` array.
    mockCacheGet.mockResolvedValue({
      text: 'Here are the recent official changes...',
      sources: [{ web: { uri: 'https://www.gov.uk/x', title: 'GOV.UK' } }],
    });

    const { getUpdates } = await import('./aiService.js');
    const result = await getUpdates();

    expect(Array.isArray(result.items)).toBe(true);
    expect(result).not.toHaveProperty('text');
  });

  it('returns a correctly-shaped cache value as-is', async () => {
    const good = {
      items: [{ id: 'news-1', title: 'A real update' }],
      sources: [],
    };
    mockCacheGet.mockResolvedValue(good);

    const { getUpdates } = await import('./aiService.js');
    const result = await getUpdates();

    expect(result).toBe(good);
  });
});
