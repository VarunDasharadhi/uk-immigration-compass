export enum Tab {
  NEWS = 'NEWS',
  PETITIONS = 'PETITIONS',
  SIMPLIFIER = 'SIMPLIFIER',
  SPONSORS = 'SPONSORS',
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
  category: string;
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

export interface PetitionItem {
  id: string;
  title: string;
  summary: string;
  signatures: string | number;
  status: string;
  url?: string;
  isActive: boolean;
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
