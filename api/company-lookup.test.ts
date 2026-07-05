const mockLookupCompany = jest.fn();
jest.mock('../services/companiesHouse.js', () => ({
  lookupCompany: (...args: any[]) => mockLookupCompany(...args),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('../services/rateLimit.js', () => ({
  checkRateLimit: (...args: any[]) => mockCheckRateLimit(...args),
  clientKey: () => 'test-ip',
}));

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
}

describe('/api/company-lookup', () => {
  beforeEach(() => {
    mockLookupCompany.mockReset();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 10 });
  });

  it('returns 400 when companyName is missing', async () => {
    const { default: handler } = await import('./company-lookup.js');
    const req: any = { query: {} };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const { default: handler } = await import('./company-lookup.js');
    const req: any = { query: { companyName: 'Acme Ltd' } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(mockLookupCompany).not.toHaveBeenCalled();
  });

  it('returns the lookup result on success', async () => {
    mockLookupCompany.mockResolvedValue({ companiesHouseUrl: 'https://x', natureOfBusiness: 'IT' });
    const { default: handler } = await import('./company-lookup.js');
    const req: any = { query: { companyName: 'Acme Ltd' } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ companiesHouseUrl: 'https://x', natureOfBusiness: 'IT' });
  });

  it('fails open (200 with lookup result) when checkRateLimit itself throws', async () => {
    mockCheckRateLimit.mockRejectedValue(new Error('redis down'));
    mockLookupCompany.mockResolvedValue({ companiesHouseUrl: 'https://x', natureOfBusiness: 'IT' });
    const { default: handler } = await import('./company-lookup.js');
    const req: any = { query: { companyName: 'Acme Ltd' } };
    const res = mockRes();

    await handler(req, res);

    expect(mockLookupCompany).toHaveBeenCalledWith('Acme Ltd');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ companiesHouseUrl: 'https://x', natureOfBusiness: 'IT' });
  });

  it('falls back to a no-match shape (200) instead of a 500 if lookupCompany throws', async () => {
    mockLookupCompany.mockRejectedValue(new Error('boom'));
    const { default: handler } = await import('./company-lookup.js');
    const req: any = { query: { companyName: 'Acme Ltd' } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ companiesHouseUrl: null, natureOfBusiness: null });
  });
});
