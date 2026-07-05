const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockAgeMs = jest.fn();

jest.mock('./cache.js', () => ({
  get: (...args: any[]) => mockCacheGet(...args),
  set: (...args: any[]) => mockCacheSet(...args),
  ageMs: (...args: any[]) => mockAgeMs(...args),
}));

jest.mock('./aiService.js', () => ({
  canonicalName: (s: string) => s.toLowerCase().trim(),
}));

const mockGetSicDescription = jest.fn();
jest.mock('./sicCodes.js', () => ({
  getSicDescription: (...args: any[]) => mockGetSicDescription(...args),
}));

describe('companiesHouse.lookupCompany', () => {
  const originalKey = process.env.COMPANIES_HOUSE_API_KEY;

  beforeEach(() => {
    jest.resetModules();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockAgeMs.mockReset();
    mockGetSicDescription.mockReset();
    process.env.COMPANIES_HOUSE_API_KEY = 'test-key';
    (global as any).fetch = jest.fn();
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.COMPANIES_HOUSE_API_KEY;
    else process.env.COMPANIES_HOUSE_API_KEY = originalKey;
  });

  it('returns the cached result without calling fetch when the cache is fresh', async () => {
    mockCacheGet.mockResolvedValue({ companiesHouseUrl: 'https://cached', natureOfBusiness: 'Cached business' });
    mockAgeMs.mockReturnValue(1000);

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({ companiesHouseUrl: 'https://cached', natureOfBusiness: 'Cached business' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns no match without calling fetch when no API key is configured', async () => {
    delete process.env.COMPANIES_HOUSE_API_KEY;
    mockCacheGet.mockResolvedValue(undefined);

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({ companiesHouseUrl: null, natureOfBusiness: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns no match and caches it when the search finds no exact name match', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ title: 'Acme Holdings Ltd', company_number: '00000001' }] }),
    });

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({ companiesHouseUrl: null, natureOfBusiness: null });
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining('ch-lookup:v1:'),
      { companiesHouseUrl: null, natureOfBusiness: null }
    );
  });

  it('resolves the company profile and SIC description on an exact match, and caches it', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ title: 'acme ltd', company_number: '01234567' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sic_codes: ['62020'] }),
      });
    mockGetSicDescription.mockResolvedValue('Information technology consultancy activities');

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({
      companiesHouseUrl: 'https://find-and-update.company-information.service.gov.uk/company/01234567',
      natureOfBusiness: 'Information technology consultancy activities',
    });
    expect(mockGetSicDescription).toHaveBeenCalledWith('62020');
    expect(mockCacheSet).toHaveBeenCalledWith(expect.stringContaining('ch-lookup:v1:'), result);
  });

  it('returns no match without caching when the search call throws', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({ companiesHouseUrl: null, natureOfBusiness: null });
    expect(mockCacheSet).not.toHaveBeenCalled();
  });
});
