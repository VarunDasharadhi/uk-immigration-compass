export enum Tab {
  NEWS = 'NEWS',
  PETITIONS = 'PETITIONS',
  SIMPLIFIER = 'SIMPLIFIER',
  SPONSORS = 'SPONSORS',
  PRIVACY = 'PRIVACY',
  TERMS = 'TERMS',
}

export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

export interface AIResponse {
  text: string;
  sources: GroundingChunk[];
}

export interface NewsItem {
  id: string;
  title: string;
  status: string;
  date: string;
  // Best-effort timestamp parsed from `date` (ms since epoch), used to sort
  // and to prune archive entries older than a year — falls back to the
  // ingestion time when the AI's free-text date couldn't be parsed.
  parsedDate: number;
  category: 'Work' | 'Student' | 'Family' | 'Asylum' | 'General';
  summary: string;
  details: string;
  impact: string;
  nextSteps: string;
  timeline: string;
  searchKeywords: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatesResponse {
  items: NewsItem[];
  sources: GroundingChunk[];
}

export interface PetitionItem {
  id: string;
  title: string;
  summary: string;
  signatures: string | number;
  status: string;
  url?: string;
  isActive: boolean;
}

export interface PetitionSignatureSnapshot {
  date: string;
  total: number;
}

export interface PetitionsResult {
  petitions: PetitionItem[];
  sources: GroundingChunk[];
  // Daily snapshots of the total signatures across the current top petitions,
  // recorded by our own nightly refresh (Parliament's API only exposes a live
  // count, not history) — so the velocity graph only has real data once a few
  // days' worth of snapshots have accumulated.
  signatureHistory: PetitionSignatureSnapshot[];
}

export interface SponsorHistoryEvent {
  date: string;
  status: string;
  details: string;
}

export interface SponsorCandidate {
  name: string;
  town: string;
  route: string;
  // Whether this suggestion is currently licensed or a historically revoked
  // entity — candidates can come from either pool, and the UI must not let
  // a revoked suggestion look like a live one.
  status: 'Licensed' | 'Revoked';
}

export interface SponsorCheckResult {
  companyName: string;
  town: string;
  rating: string;
  routes: string[];
  status: string;
  natureOfBusiness?: string;
  dateGranted?: string;
  sponsorType?: string;
  notes: string;
  history: SponsorHistoryEvent[];
  // Other similarly-named entries found in the current register or historical
  // ledger. Presence means the match wasn't exact/confirmed — the primary
  // result should not be treated as a confirmed identity match without the
  // user picking the right one.
  candidates?: SponsorCandidate[];
}

export interface SponsorNewsItem {
  title: string;
  date: string;
  summary: string;
  changeType: 'added' | 'revoked' | 'info' | string;
}

export interface CompanyLookupResult {
  companiesHouseUrl: string | null;
  // Companies House allows up to 4 SIC codes per company; this holds every
  // description that resolved, in the order Companies House returned them
  // (primary code first). Null when none resolved.
  natureOfBusiness: string[] | null;
  // Pre-formatted registered office address from Companies House (street,
  // locality, postcode), more specific than the sponsor register's bare
  // town name. Null when there's no confident Companies House match.
  registeredOfficeAddress: string | null;
}

export interface SponsorDirectoryEntry {
  name: string;
  town: string;
  routes: string[];
  rating: string;
  // SIC 2007 section id (A-U), or 'unknown' when the company has no
  // confident match in the offline Companies House industry map.
  industry: string;
  industryLabel: string;
}

export interface SponsorDirectoryFacet {
  id: string;
  label: string;
  count: number;
}

export interface SponsorDirectoryResponse {
  total: number;
  page: number;
  pageSize: number;
  items: SponsorDirectoryEntry[];
  industries: SponsorDirectoryFacet[];
  routes: SponsorDirectoryFacet[];
  // ISO timestamp the industry map was last built, so the UI can show
  // "industry data as of <date>" and explain why very recent sponsors show
  // as Unknown.
  mapGeneratedAt: string;
}
