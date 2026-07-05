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
    mockCacheGet.mockResolvedValue({
      companiesHouseUrl: 'https://cached',
      natureOfBusiness: ['Cached business'],
      registeredOfficeAddress: '1 Cached Street, London, EC1 1AA',
    });
    mockAgeMs.mockReturnValue(1000);

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({
      companiesHouseUrl: 'https://cached',
      natureOfBusiness: ['Cached business'],
      registeredOfficeAddress: '1 Cached Street, London, EC1 1AA',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns no match without calling fetch when no API key is configured', async () => {
    delete process.env.COMPANIES_HOUSE_API_KEY;
    mockCacheGet.mockResolvedValue(undefined);

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({ companiesHouseUrl: null, natureOfBusiness: null, registeredOfficeAddress: null });
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

    expect(result).toEqual({ companiesHouseUrl: null, natureOfBusiness: null, registeredOfficeAddress: null });
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining('ch-lookup:v3:'),
      { companiesHouseUrl: null, natureOfBusiness: null, registeredOfficeAddress: null }
    );
  });

  it('resolves the company profile, SIC description, and registered office address on an exact match, and caches it', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ title: 'acme ltd', company_number: '01234567' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sic_codes: ['62020'],
          registered_office_address: {
            address_line_1: '1 New Street Square',
            locality: 'London',
            postal_code: 'EC4A 3HQ',
            country: 'United Kingdom',
          },
        }),
      });
    mockGetSicDescription.mockResolvedValue('Information technology consultancy activities');

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({
      companiesHouseUrl: 'https://find-and-update.company-information.service.gov.uk/company/01234567',
      natureOfBusiness: ['Information technology consultancy activities'],
      registeredOfficeAddress: '1 New Street Square, London, EC4A 3HQ, United Kingdom',
    });
    expect(mockGetSicDescription).toHaveBeenCalledWith('62020');
    expect(mockCacheSet).toHaveBeenCalledWith(expect.stringContaining('ch-lookup:v3:'), result);
  });

  it('resolves every SIC code when a company has more than one, in order', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ title: 'acme ltd', company_number: '01234567' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sic_codes: ['62020', '70229', '99999'] }),
      });
    mockGetSicDescription.mockImplementation(async (code: string) => {
      if (code === '62020') return 'Information technology consultancy activities';
      if (code === '70229') return 'Management consultancy activities other than financial management';
      return null; // '99999' has no known description
    });

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result.natureOfBusiness).toEqual([
      'Information technology consultancy activities',
      'Management consultancy activities other than financial management',
    ]);
    expect(mockGetSicDescription).toHaveBeenCalledTimes(3);
  });

  it('omits blank address fields when formatting the registered office address', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ title: 'acme ltd', company_number: '01234567' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          registered_office_address: {
            address_line_1: '1 New Street Square',
            address_line_2: '',
            locality: 'London',
            region: undefined,
            postal_code: 'EC4A 3HQ',
          },
        }),
      });

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result.registeredOfficeAddress).toBe('1 New Street Square, London, EC4A 3HQ');
  });

  it('returns a null registered office address when Companies House has none on file', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ title: 'acme ltd', company_number: '01234567' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result.registeredOfficeAddress).toBeNull();
  });

  it('returns no match without caching when the search call throws', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({ companiesHouseUrl: null, natureOfBusiness: null, registeredOfficeAddress: null });
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('returns no match without caching when the search response is not ok (e.g. rate limited)', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 429 });

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({ companiesHouseUrl: null, natureOfBusiness: null, registeredOfficeAddress: null });
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('returns a partial result without caching when the profile fetch response is not ok', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ title: 'acme ltd', company_number: '01234567' }] }),
      })
      .mockResolvedValueOnce({ ok: false, status: 429 });

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({
      companiesHouseUrl: 'https://find-and-update.company-information.service.gov.uk/company/01234567',
      natureOfBusiness: null,
      registeredOfficeAddress: null,
    });
    expect(mockGetSicDescription).not.toHaveBeenCalled();
    expect(mockCacheSet).not.toHaveBeenCalled();
  });
});
