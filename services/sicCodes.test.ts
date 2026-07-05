const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();

jest.mock('./cache.js', () => ({
  get: (...args: any[]) => mockCacheGet(...args),
  set: (...args: any[]) => mockCacheSet(...args),
}));

const SAMPLE_CSV =
  'sic_code.string(),sic_description.string()\n' +
  '62020,Information technology consultancy activities\n' +
  '01110,Growing of cereals (except rice), leguminous crops and oil seeds\n';

describe('sicCodes', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    (global as any).fetch = jest.fn();
  });

  it('fetches and parses the CSV on a cache miss, then caches the parsed map', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => SAMPLE_CSV });

    const { getSicDescription } = await import('./sicCodes.js');
    const result = await getSicDescription('62020');

    expect(result).toBe('Information technology consultancy activities');
    expect(mockCacheSet).toHaveBeenCalledWith(
      'sic-codes:v1',
      expect.objectContaining({ '62020': 'Information technology consultancy activities' })
    );
  });

  it('correctly parses a description that itself contains a comma', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => SAMPLE_CSV });

    const { getSicDescription } = await import('./sicCodes.js');
    const result = await getSicDescription('01110');

    expect(result).toBe('Growing of cereals (except rice), leguminous crops and oil seeds');
  });

  it('returns null for a code not in the table', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => SAMPLE_CSV });

    const { getSicDescription } = await import('./sicCodes.js');
    const result = await getSicDescription('99999');

    expect(result).toBeNull();
  });

  it('uses the cached map and never calls fetch on a cache hit', async () => {
    mockCacheGet.mockResolvedValue({ '62020': 'Information technology consultancy activities' });

    const { getSicDescription } = await import('./sicCodes.js');
    const result = await getSicDescription('62020');

    expect(result).toBe('Information technology consultancy activities');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('resolves to null instead of throwing when fetch itself rejects', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    const { getSicDescription } = await import('./sicCodes.js');
    const result = await getSicDescription('62020');

    expect(result).toBeNull();
  });

  it('retries the fetch on a later call after a prior failure, instead of latching an empty table', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));

    const { getSicDescription } = await import('./sicCodes.js');
    const firstResult = await getSicDescription('62020');
    expect(firstResult).toBeNull();

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, text: async () => SAMPLE_CSV });
    const secondResult = await getSicDescription('62020');

    expect(secondResult).toBe('Information technology consultancy activities');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
