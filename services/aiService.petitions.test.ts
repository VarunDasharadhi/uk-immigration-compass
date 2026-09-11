import { getPetitions, refreshPetitions } from './aiService';

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn().mockResolvedValue(undefined);

jest.mock('./cache.js', () => ({
  get: (...args: any[]) => mockCacheGet(...args),
  set: (...args: any[]) => mockCacheSet(...args),
  setMany: jest.fn().mockResolvedValue(undefined),
  has: jest.fn().mockReturnValue(false),
  load: jest.fn(),
  ageMs: jest.fn().mockReturnValue(Infinity),
  getRedisClient: jest.fn().mockReturnValue(null),
}));

const TERMS = ['immigration', 'visa', 'asylum', 'ILR', 'deportation'];

function petition(id: number, sigs: number, action = `Visa reform petition ${id}`) {
  return {
    id,
    attributes: {
      action,
      signature_count: sigs,
      state: 'open',
      background: 'Background text',
      debate_outcome_at: null,
      debate_scheduled_on: null,
      government_response_at: null,
      response_threshold_reached_at: null,
    },
  };
}

const envelope = (items: ReturnType<typeof petition>[], next: string | null) => ({
  ok: true,
  json: async () => ({ data: items, links: { next } }),
});

describe('refreshPetitions breadth', () => {
  beforeEach(() => {
    mockCacheGet.mockReset().mockResolvedValue([]);
    mockCacheSet.mockReset().mockResolvedValue(undefined);
  });

  it('follows the next-page link, dedupes across terms, and stores sorted under petitions:v3', async () => {
    global.fetch = jest.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('q=immigration')) {
        return u.includes('page=2')
          ? envelope([petition(101, 10)], null)
          : envelope([petition(1, 500), petition(2, 400)], 'https://petition.parliament.uk/petitions.json?page=2&q=immigration&state=open');
      }
      if (u.includes('q=visa')) return envelope([petition(2, 400), petition(3, 300)], null); // 2 dedupes against immigration
      if (u.includes('q=asylum')) return envelope([petition(4, 200)], null);
      if (u.includes('q=ILR')) return envelope([petition(5, 100)], null);
      if (u.includes('q=deportation')) return envelope([petition(6, 50)], null);
      return envelope([], null);
    }) as unknown as typeof fetch;

    await refreshPetitions();

    const call = mockCacheSet.mock.calls.find(c => c[0] === 'petitions:v3');
    expect(call).toBeTruthy();
    const stored = call![1].petitions;
    // 1, 2, 3, 4, 5, 6, 101 with id 2 deduped and everything sorted desc
    expect(stored.map((p: any) => p.signatures)).toEqual([500, 400, 300, 200, 100, 50, 10]);
    expect(new Set(stored.map((p: any) => p.id)).size).toBe(stored.length);
  });

  it('caps the stored set at 100 petitions', async () => {
    // Two pages of 120 relevant petitions per term: 600 unique candidates
    global.fetch = jest.fn(async (url: any) => {
      const u = String(url);
      const termIndex = TERMS.findIndex(t => u.includes(`q=${t}`));
      const base = termIndex * 1000;
      const ids = Array.from({ length: 120 }, (_, i) => base + i + 1);
      const page = parseInt((u.match(/page=(\d+)/) || [])[1] || '1', 10);
      const slice = page === 1 ? ids.slice(0, 60) : ids.slice(60);
      return envelope(slice.map(id => petition(id, id)), page === 1 ? u + '&page=2' : null);
    }) as unknown as typeof fetch;

    await refreshPetitions();

    const call = mockCacheSet.mock.calls.find(c => c[0] === 'petitions:v3');
    const stored = call![1].petitions;
    expect(stored).toHaveLength(100);
    const sigs = stored.map((p: any) => p.signatures);
    expect([...sigs].sort((a: number, b: number) => b - a)).toEqual(sigs);
  });
});

describe('getPetitions cache key', () => {
  it('reads the v3 key and serves it without a refresh', async () => {
    const stored = { petitions: [{ id: 'pet-1' }], sources: [], signatureHistory: [] };
    mockCacheGet.mockReset().mockImplementation(async (key: string) =>
      key === 'petitions:v3' ? stored : undefined
    );
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getPetitions();
    expect(result).toBe(stored);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
