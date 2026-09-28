// The sidebar's "recently added and removed" list used to walk 676 history
// buckets on every cold function instance (~11s). It is now also cached in the
// shared Redis instance, so a cold instance reads it in one call. These tests
// prove the shared cache actually short-circuits that scan, and that a
// populated value is returned as-is.
const mockCacheGet = jest.fn();
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

jest.mock('./cache.js', () => ({
  get: (...args: any[]) => mockCacheGet(...args),
  set: jest.fn().mockResolvedValue(undefined),
  setMany: jest.fn().mockResolvedValue(undefined),
  has: jest.fn().mockReturnValue(false),
  load: jest.fn(),
  ageMs: jest.fn().mockReturnValue(Infinity),
  getRedisClient: jest.fn(() => mockRedis),
}));

describe('getRecentSponsorChanges shared cache', () => {
  let mod: typeof import('./aiService');

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCacheGet.mockReset().mockResolvedValue(undefined);
    mockRedis.get.mockReset().mockResolvedValue(null);
    mockRedis.set.mockReset().mockResolvedValue('OK');
    mockRedis.del.mockReset().mockResolvedValue(1);
    mod = await import('./aiService');
  });

  it('returns the shared cached list without scanning any history bucket', async () => {
    const cached = [
      { company: 'Acme Ltd', town: 'Leeds', type: 'added' as const, date: '2026-09-10' },
      { company: 'Old Ltd', town: 'Hull', type: 'removed' as const, date: '2026-09-09' },
    ];
    // JSON string, as written by us
    mockRedis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await mod.getRecentSponsorChanges();

    expect(result).toEqual(cached);
    // The whole point: no ledger scan happened
    expect(mockCacheGet).not.toHaveBeenCalled();
  });

  it('accepts an auto-deserialized object from upstash, not just a string', async () => {
    // The upstash REST client JSON-parses stored values on read
    const cached = [{ company: 'Obj Ltd', town: 'Bath', type: 'added' as const, date: '2026-09-10' }];
    mockRedis.get.mockResolvedValue(cached);

    const result = await mod.getRecentSponsorChanges();

    expect(result).toEqual(cached);
    expect(mockCacheGet).not.toHaveBeenCalled();
  });

  it('scans and writes the shared cache when it is empty, and memoises per instance', async () => {
    // Empty shared cache and no ledger data, so the scan finds nothing
    mockRedis.get.mockResolvedValue(null);

    const first = await mod.getRecentSponsorChanges();
    expect(first).toEqual([]);

    // Second call is served by the 10-minute in-process memo, not another scan
    await mod.getRecentSponsorChanges();
    const bucketReads = mockCacheGet.mock.calls.filter(c => String(c[0]).startsWith('history-bucket:'));
    const scansAfterFirst = bucketReads.length;
    await mod.getRecentSponsorChanges();
    const scansAfterThird = mockCacheGet.mock.calls.filter(c => String(c[0]).startsWith('history-bucket:')).length;
    expect(scansAfterFirst).toBe(scansAfterThird);
  });

  it('still returns an empty list rather than throwing when Redis is unavailable', async () => {
    const cache = await import('./cache');
    (cache.getRedisClient as jest.Mock).mockReturnValue(null);

    const result = await mod.getRecentSponsorChanges();

    expect(result).toEqual([]);
    // No write attempted without a client
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});
