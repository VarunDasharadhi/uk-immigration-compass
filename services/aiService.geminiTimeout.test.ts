import { refreshUpdates } from './aiService';

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

describe('refreshUpdates Gemini timeout budget', () => {
  const originalKey = process.env.GEMINI_API_KEY_PAID;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env.GEMINI_API_KEY_PAID = 'test-key';
    mockCacheGet.mockReset().mockResolvedValue([]);
    mockCacheSet.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY_PAID;
    else process.env.GEMINI_API_KEY_PAID = originalKey;
  });

  it('allows a grounded Gemini search to run beyond 45 seconds', async () => {
    let release: ((value: Pick<Response, 'ok' | 'status' | 'json'>) => void) | undefined;
    global.fetch = jest.fn((_url: any, init?: RequestInit) => new Promise<Pick<Response, 'ok' | 'status' | 'json'>>((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
      release = resolve;
    })) as unknown as typeof fetch;

    const refresh = refreshUpdates();
    const observed = jest.fn();
    void refresh.catch(observed);

    await jest.advanceTimersByTimeAsync(46_000);
    expect(observed).not.toHaveBeenCalled();

    release!({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: '|START|\nTITLE: Fresh policy update\nDATE: 24 September 2026\nCATEGORY: Work\nSUMMARY: Test update\nDETAILS: Test details\nIMPACT: Test impact\nNEXT_STEPS: Check GOV.UK\nTIMELINE: Current\nSEARCH_KEYWORDS: test\nSOURCE_URL: https://www.gov.uk/test\n|END|' }] },
          groundingMetadata: { groundingChunks: [{ web: { uri: 'https://www.gov.uk/test', title: 'Test' } }] },
        }],
      }),
    });

    await expect(refresh).resolves.toMatchObject({ items: expect.any(Array) });
  });
});