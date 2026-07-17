/**
 * sponsorDirectory.ts
 * Serves the full GOV.UK sponsor register as a browsable, filterable
 * directory — search by name/town, filter by visa route, and (the reason
 * this exists) filter by industry, joined offline against the
 * data/sponsor-industry-map.json artifact built by
 * scripts/build-industry-map.ts. No live Companies House API calls here:
 * that map is a static, periodically-rebuilt snapshot.
 */

import * as aiService from './aiService.js';
import type { RegisterEntry } from './aiService.js';
import { canonicalName } from '../utils/canonicalName.js';
import { SIC_SECTION_LABELS, SicSectionId } from './sicSections.js';
import type { SponsorDirectoryEntry, SponsorDirectoryFacet, SponsorDirectoryResponse } from '../types.js';
import industryMapArtifact from '../data/sponsor-industry-map.json';

const UNKNOWN_INDUSTRY = 'unknown';
const ALL_SECTION_IDS = Object.keys(SIC_SECTION_LABELS) as SicSectionId[];

interface IndustryMapArtifact {
  generatedAt: string;
  sections: Record<string, string>;
  companies: Record<string, string[]>;
}
const artifact = industryMapArtifact as IndustryMapArtifact;

// Built once, lazily: canonical company name -> SIC section id.
let industryByCanonicalName: Map<string, SicSectionId> | null = null;
function industryOf(canonicalCompanyName: string): SicSectionId | undefined {
  if (!industryByCanonicalName) {
    industryByCanonicalName = new Map();
    for (const [section, names] of Object.entries(artifact.companies)) {
      for (const name of names) industryByCanonicalName.set(name, section as SicSectionId);
    }
  }
  return industryByCanonicalName.get(canonicalCompanyName);
}

export interface DirectoryRow {
  name: string;
  nameLower: string;
  town: string;
  townLower: string;
  routes: string[];
  rating: string;
  industry: string;
  industryLabel: string;
}

// The register CSV has one row per (company, route) pair — 10.6% of
// companies sponsor under more than one route. Groups by exact name (not
// canonical name) so two distinct companies that happen to canonicalize the
// same way after suffix-stripping are never merged into one directory row.
export function buildDirectory(
  entries: readonly RegisterEntry[],
  resolveIndustry: (canonicalCompanyName: string) => string | undefined
): DirectoryRow[] {
  const byName = new Map<string, { name: string; town: string; routes: Set<string>; typeRatings: string[] }>();
  for (const e of entries) {
    const key = e.name.toLowerCase();
    let group = byName.get(key);
    if (!group) {
      group = { name: e.name, town: e.town, routes: new Set(), typeRatings: [] };
      byName.set(key, group);
    }
    if (e.route) group.routes.add(e.route);
    if (e.typeRating) group.typeRatings.push(e.typeRating);
  }

  const rows: DirectoryRow[] = [];
  for (const group of byName.values()) {
    // CSV format is "Worker (A rating)" / "Temporary Worker (A rating)", not
    // "Grade A" — same pattern used by buildLicensedResult in aiService.
    const ratingMatch = group.typeRatings.join(' ').match(/\b([AB])\s*rating\b/i);
    const rating = ratingMatch ? `Grade ${ratingMatch[1].toUpperCase()}` : 'Unknown';

    const section = resolveIndustry(canonicalName(group.name));
    const industry = section ?? UNKNOWN_INDUSTRY;
    const industryLabel = section ? SIC_SECTION_LABELS[section as SicSectionId] : 'Other / Unknown';

    rows.push({
      name: group.name,
      nameLower: group.name.toLowerCase(),
      town: group.town,
      townLower: group.town.toLowerCase(),
      routes: [...group.routes].sort(),
      rating,
      industry,
      industryLabel,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export interface DirectoryFilters {
  industry?: string; // 'all' | SicSectionId | 'unknown'
  route?: string; // 'all' | an exact route string
  q?: string; // substring match on name or town
}

export function filterRows(rows: DirectoryRow[], filters: DirectoryFilters): DirectoryRow[] {
  const q = filters.q?.trim().toLowerCase();
  return rows.filter(r => {
    if (filters.industry && filters.industry !== 'all' && r.industry !== filters.industry) return false;
    if (filters.route && filters.route !== 'all' && !r.routes.includes(filters.route)) return false;
    if (q && !r.nameLower.includes(q) && !r.townLower.includes(q)) return false;
    return true;
  });
}

// Standard disjunctive faceting: each facet's counts are computed with every
// filter EXCEPT its own applied, so a pill shows "what you'd get if you
// clicked it," not "what's left after you already did."
export function computeFacets(
  rows: DirectoryRow[],
  filters: DirectoryFilters
): { industries: SponsorDirectoryFacet[]; routes: SponsorDirectoryFacet[] } {
  const forIndustryFacet = filterRows(rows, { route: filters.route, q: filters.q });
  const industryCounts = new Map<string, number>();
  for (const r of forIndustryFacet) industryCounts.set(r.industry, (industryCounts.get(r.industry) ?? 0) + 1);

  const forRouteFacet = filterRows(rows, { industry: filters.industry, q: filters.q });
  const routeCounts = new Map<string, number>();
  for (const r of forRouteFacet) {
    for (const route of r.routes) routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);
  }

  const industries: SponsorDirectoryFacet[] = [
    { id: 'all', label: 'All industries', count: forIndustryFacet.length },
    ...ALL_SECTION_IDS.map(id => ({ id, label: SIC_SECTION_LABELS[id], count: industryCounts.get(id) ?? 0 })),
    { id: UNKNOWN_INDUSTRY, label: 'Other / Unknown', count: industryCounts.get(UNKNOWN_INDUSTRY) ?? 0 },
  ];

  const routes: SponsorDirectoryFacet[] = [
    { id: 'all', label: 'All routes', count: forRouteFacet.length },
    ...[...routeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, label: id, count })),
  ];

  return { industries, routes };
}

export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = Math.max(0, (page - 1) * pageSize);
  return rows.slice(start, start + pageSize);
}

function toEntry(row: DirectoryRow): SponsorDirectoryEntry {
  return { name: row.name, town: row.town, routes: row.routes, rating: row.rating, industry: row.industry, industryLabel: row.industryLabel };
}

// Memoized on the register's own version counter so a nightly in-process
// refresh (long-lived Express) rebuilds the directory; Vercel instances just
// recycle and rebuild fresh.
let builtForVersion = -1;
let directoryCache: DirectoryRow[] = [];
function getDirectory(): DirectoryRow[] {
  const { entries, version } = aiService.getRegisterSnapshot();
  if (version !== builtForVersion) {
    directoryCache = buildDirectory(entries, industryOf);
    builtForVersion = version;
  }
  return directoryCache;
}

export interface DirectoryQueryParams extends DirectoryFilters {
  page?: number;
  pageSize?: number;
}

export function queryDirectory(params: DirectoryQueryParams): SponsorDirectoryResponse {
  const rows = getDirectory();
  const filters: DirectoryFilters = { industry: params.industry, route: params.route, q: params.q };
  const filtered = filterRows(rows, filters);
  const { industries, routes } = computeFacets(rows, filters);
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 24;

  return {
    total: filtered.length,
    page,
    pageSize,
    items: paginate(filtered, page, pageSize).map(toEntry),
    industries,
    routes,
    mapGeneratedAt: artifact.generatedAt,
  };
}

export function isValidIndustryId(id: string): boolean {
  return id === 'all' || id === UNKNOWN_INDUSTRY || (ALL_SECTION_IDS as string[]).includes(id);
}
