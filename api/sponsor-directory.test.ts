const mockEnsureSponsorDataLoaded = jest.fn();
jest.mock('../services/aiService.js', () => ({
  ensureSponsorDataLoaded: (...args: any[]) => mockEnsureSponsorDataLoaded(...args),
}));

const mockQueryDirectory = jest.fn();
const mockIsValidIndustryId = jest.fn();
jest.mock('../services/sponsorDirectory.js', () => ({
  queryDirectory: (...args: any[]) => mockQueryDirectory(...args),
  isValidIndustryId: (...args: any[]) => mockIsValidIndustryId(...args),
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

const SAMPLE_RESPONSE = { total: 0, page: 1, pageSize: 24, items: [], industries: [], routes: [], mapGeneratedAt: '2026-01-01T00:00:00.000Z' };

describe('/api/sponsor-directory', () => {
  beforeEach(() => {
    mockEnsureSponsorDataLoaded.mockReset().mockResolvedValue(undefined);
    mockQueryDirectory.mockReset().mockReturnValue(SAMPLE_RESPONSE);
    mockIsValidIndustryId.mockReset().mockReturnValue(true);
    mockCheckRateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 10 });
  });

  it('returns 400 for an invalid industry parameter', async () => {
    mockIsValidIndustryId.mockReturnValue(false);
    const { default: handler } = await import('./sponsor-directory.js');
    const req: any = { query: { industry: 'not-a-real-section' } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockQueryDirectory).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-positive page', async () => {
    const { default: handler } = await import('./sponsor-directory.js');
    const req: any = { query: { page: '0' } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for a non-numeric pageSize', async () => {
    const { default: handler } = await import('./sponsor-directory.js');
    const req: any = { query: { pageSize: 'lots' } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('clamps an oversized pageSize down to the max', async () => {
    const { default: handler } = await import('./sponsor-directory.js');
    const req: any = { query: { pageSize: '99999' } };
    const res = mockRes();

    await handler(req, res);

    expect(mockQueryDirectory).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }));
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const { default: handler } = await import('./sponsor-directory.js');
    const req: any = { query: {} };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(mockQueryDirectory).not.toHaveBeenCalled();
  });

  it('uses the "browse" rate-limit preset', async () => {
    const { default: handler } = await import('./sponsor-directory.js');
    const req: any = { query: {} };
    const res = mockRes();

    await handler(req, res);

    expect(mockCheckRateLimit).toHaveBeenCalledWith('sponsor-directory:test-ip', 'browse');
  });

  it('fails open when checkRateLimit itself throws', async () => {
    mockCheckRateLimit.mockRejectedValue(new Error('redis down'));
    const { default: handler } = await import('./sponsor-directory.js');
    const req: any = { query: {} };
    const res = mockRes();

    await handler(req, res);

    expect(mockQueryDirectory).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('awaits ensureSponsorDataLoaded, queries the directory, and sets the cache header on success', async () => {
    const { default: handler } = await import('./sponsor-directory.js');
    const req: any = { query: { industry: 'J', route: 'Skilled Worker', q: 'tesco', page: '2', pageSize: '10' } };
    const res = mockRes();

    await handler(req, res);

    expect(mockEnsureSponsorDataLoaded).toHaveBeenCalled();
    expect(mockQueryDirectory).toHaveBeenCalledWith({ industry: 'J', route: 'Skilled Worker', q: 'tesco', page: 2, pageSize: 10 });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('s-maxage'));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(SAMPLE_RESPONSE);
  });

  it('defaults industry to "all", route to "all", and pageSize to 24 when not provided', async () => {
    const { default: handler } = await import('./sponsor-directory.js');
    const req: any = { query: {} };
    const res = mockRes();

    await handler(req, res);

    expect(mockQueryDirectory).toHaveBeenCalledWith({ industry: 'all', route: 'all', q: '', page: 1, pageSize: 24 });
  });

  it('returns 500 instead of throwing when queryDirectory itself throws', async () => {
    mockQueryDirectory.mockImplementation(() => { throw new Error('boom'); });
    const { default: handler } = await import('./sponsor-directory.js');
    const req: any = { query: {} };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
