jest.mock('../data/sponsor-industry-map.json', () => ({
  generatedAt: '2026-01-01T00:00:00.000Z',
  sections: {},
  companies: {},
}), { virtual: true });

jest.mock('./aiService.js', () => ({
  getRegisterSnapshot: jest.fn(),
}));

import { buildDirectory, filterRows, computeFacets, paginate, queryDirectory, isValidIndustryId, DirectoryRow } from './sponsorDirectory.js';
import * as aiService from './aiService.js';

const mockGetRegisterSnapshot = aiService.getRegisterSnapshot as jest.Mock;

function industryOf(canon: string): string | undefined {
  const table: Record<string, string> = {
    tesco: 'J',
    deloitte: 'M',
  };
  return table[canon];
}

describe('buildDirectory', () => {
  it('merges multiple route rows for the same company into one entry with unioned routes', () => {
    const rows = buildDirectory(
      [
        { name: 'Capgemini UK PLC', town: 'London', typeRating: 'Worker (A rating)', route: 'Skilled Worker' },
        { name: 'Capgemini UK PLC', town: 'London', typeRating: 'Worker (A rating)', route: 'Graduate Trainee' },
      ],
      industryOf
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].routes).toEqual(['Graduate Trainee', 'Skilled Worker']);
  });

  it('extracts "Grade A" / "Grade B" from the register\'s "Worker (X rating)" text', () => {
    const rows = buildDirectory(
      [{ name: 'Foo Ltd', town: 'Leeds', typeRating: 'Temporary Worker (B rating)', route: 'Seasonal Worker' }],
      industryOf
    );
    expect(rows[0].rating).toBe('Grade B');
  });

  it('falls back to "Unknown" rating when no A/B rating text is present', () => {
    const rows = buildDirectory(
      [{ name: 'Foo Ltd', town: 'Leeds', typeRating: '', route: 'Seasonal Worker' }],
      industryOf
    );
    expect(rows[0].rating).toBe('Unknown');
  });

  it('buckets a company with no industry match under "unknown"', () => {
    const rows = buildDirectory(
      [{ name: 'Totally Unmatched Ltd', town: 'Hull', typeRating: 'Worker (A rating)', route: 'Skilled Worker' }],
      industryOf
    );
    expect(rows[0].industry).toBe('unknown');
    expect(rows[0].industryLabel).toBe('Other / Unknown');
  });

  it('keeps two distinct companies separate even if they canonicalize the same way', () => {
    // Both "Alpha Ltd" and "Alpha Limited" canonicalize to "alpha" but are
    // different exact register names, so must remain distinct directory rows.
    const rows = buildDirectory(
      [
        { name: 'Alpha Ltd', town: 'Leeds', typeRating: 'Worker (A rating)', route: 'Skilled Worker' },
        { name: 'Alpha Limited', town: 'Bristol', typeRating: 'Worker (B rating)', route: 'Skilled Worker' },
      ],
      industryOf
    );
    expect(rows).toHaveLength(2);
  });

  it('sorts rows alphabetically by name', () => {
    const rows = buildDirectory(
      [
        { name: 'Zeta Ltd', town: 'Leeds', typeRating: '', route: 'Skilled Worker' },
        { name: 'Alpha Ltd', town: 'Leeds', typeRating: '', route: 'Skilled Worker' },
      ],
      industryOf
    );
    expect(rows.map(r => r.name)).toEqual(['Alpha Ltd', 'Zeta Ltd']);
  });
});

const SAMPLE_ROWS: DirectoryRow[] = [
  { name: 'Tesco Stores Ltd', nameLower: 'tesco stores ltd', town: 'Welwyn Garden City', townLower: 'welwyn garden city', routes: ['Skilled Worker'], rating: 'Grade A', industry: 'J', industryLabel: 'Information & Communication' },
  { name: 'Deloitte LLP', nameLower: 'deloitte llp', town: 'London', townLower: 'london', routes: ['Skilled Worker', 'Graduate Trainee'], rating: 'Grade A', industry: 'M', industryLabel: 'Professional, Scientific & Technical' },
  { name: 'Unknown Co Ltd', nameLower: 'unknown co ltd', town: 'Hull', townLower: 'hull', routes: ['Seasonal Worker'], rating: 'Unknown', industry: 'unknown', industryLabel: 'Other / Unknown' },
];

describe('filterRows', () => {
  it('filters by exact industry id', () => {
    expect(filterRows(SAMPLE_ROWS, { industry: 'J' }).map(r => r.name)).toEqual(['Tesco Stores Ltd']);
  });

  it('treats industry "all" as no filter', () => {
    expect(filterRows(SAMPLE_ROWS, { industry: 'all' })).toHaveLength(3);
  });

  it('filters by route membership', () => {
    expect(filterRows(SAMPLE_ROWS, { route: 'Graduate Trainee' }).map(r => r.name)).toEqual(['Deloitte LLP']);
  });

  it('filters by a query substring matched against name OR town', () => {
    expect(filterRows(SAMPLE_ROWS, { q: 'deloitte' }).map(r => r.name)).toEqual(['Deloitte LLP']);
    expect(filterRows(SAMPLE_ROWS, { q: 'hull' }).map(r => r.name)).toEqual(['Unknown Co Ltd']);
  });

  it('combines industry, route, and query filters (AND semantics)', () => {
    expect(filterRows(SAMPLE_ROWS, { industry: 'M', route: 'Skilled Worker', q: 'del' }).map(r => r.name)).toEqual(['Deloitte LLP']);
    expect(filterRows(SAMPLE_ROWS, { industry: 'M', route: 'Seasonal Worker' })).toHaveLength(0);
  });
});

describe('computeFacets', () => {
  it('computes industry facet counts ignoring the industry filter itself, but respecting route/q', () => {
    const { industries } = computeFacets(SAMPLE_ROWS, { industry: 'J', route: 'all', q: '' });
    const jCount = industries.find(f => f.id === 'J')?.count;
    const mCount = industries.find(f => f.id === 'M')?.count;
    // Both J and M show their real counts, not just the currently-selected J.
    expect(jCount).toBe(1);
    expect(mCount).toBe(1);
  });

  it('computes route facet counts ignoring the route filter itself, but respecting industry/q', () => {
    const { routes } = computeFacets(SAMPLE_ROWS, { industry: 'all', route: 'Graduate Trainee', q: '' });
    const skilledWorkerCount = routes.find(r => r.id === 'Skilled Worker')?.count;
    expect(skilledWorkerCount).toBe(2); // Tesco + Deloitte both have Skilled Worker
  });

  it('the "all" facet count reflects the other active filters', () => {
    const { industries } = computeFacets(SAMPLE_ROWS, { industry: 'all', route: 'all', q: 'deloitte' });
    expect(industries.find(f => f.id === 'all')?.count).toBe(1);
  });
});

describe('paginate', () => {
  it('slices the correct page', () => {
    const rows = [1, 2, 3, 4, 5];
    expect(paginate(rows, 1, 2)).toEqual([1, 2]);
    expect(paginate(rows, 2, 2)).toEqual([3, 4]);
    expect(paginate(rows, 3, 2)).toEqual([5]);
  });

  it('returns an empty array past the end', () => {
    expect(paginate([1, 2], 5, 2)).toEqual([]);
  });
});

describe('isValidIndustryId', () => {
  it('accepts "all", "unknown", and real section ids', () => {
    expect(isValidIndustryId('all')).toBe(true);
    expect(isValidIndustryId('unknown')).toBe(true);
    expect(isValidIndustryId('J')).toBe(true);
  });

  it('rejects invalid ids', () => {
    expect(isValidIndustryId('Z')).toBe(false);
    expect(isValidIndustryId('')).toBe(false);
    expect(isValidIndustryId('123')).toBe(false);
  });
});

describe('queryDirectory', () => {
  beforeEach(() => {
    mockGetRegisterSnapshot.mockReset();
  });

  it('builds the directory from the register snapshot and paginates the result', () => {
    mockGetRegisterSnapshot.mockReturnValue({
      version: 1,
      entries: [
        { name: 'Alpha Ltd', town: 'Leeds', typeRating: 'Worker (A rating)', route: 'Skilled Worker' },
        { name: 'Beta Ltd', town: 'York', typeRating: 'Worker (B rating)', route: 'Skilled Worker' },
      ],
    });

    const result = queryDirectory({ page: 1, pageSize: 1 });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Alpha Ltd');
    expect(result.mapGeneratedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rebuilds the directory when the register version changes, and reuses the cache when it does not', () => {
    // Version numbers unique to this test so the module-level directory
    // cache (shared across tests in this file, by design) can't collide
    // with the version used by the previous test.
    mockGetRegisterSnapshot.mockReturnValue({
      version: 501,
      entries: [{ name: 'Alpha Ltd', town: 'Leeds', typeRating: '', route: 'Skilled Worker' }],
    });
    expect(queryDirectory({}).total).toBe(1);

    // Same version — even if entries changed, the cached build is reused.
    mockGetRegisterSnapshot.mockReturnValue({
      version: 501,
      entries: [],
    });
    expect(queryDirectory({}).total).toBe(1);

    // Version bump — rebuild reflects the new entries.
    mockGetRegisterSnapshot.mockReturnValue({
      version: 502,
      entries: [],
    });
    expect(queryDirectory({}).total).toBe(0);
  });
});
