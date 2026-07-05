/**
 * aiService.ts
 * Server-side AI service using OpenRouter (never imported by browser code).
 * Responses are disk-cached and refreshed once per day at local midnight.
 */

import { NewsItem, UpdatesResponse, SponsorCheckResult, SponsorNewsItem, SponsorCandidate, PetitionItem, PetitionsResult, PetitionSignatureSnapshot } from '../types.js';
import * as cache from './cache.js';
import { stripMarkdown } from '../utils/text.js';
import { parseUpdatesText, newsDedupeKey, NEWS_CATEGORIES } from '../utils/newsParsing.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const CALL_TIMEOUT_MS = 45_000;

// Lazy getters: resolved at call time, after loadEnvFile() has run
const getApiKey = () => process.env.OPENROUTER_API_KEY || '';
const getBaseModel = () => process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
const getOnlineModel = () => `${getBaseModel()}:online`;

// ─── helpers ────────────────────────────────────────────────────────────────

function parseDelimitedBlocks(text: string, startDelim: string, endDelim: string): string[] {
  return (text || '').split(startDelim).slice(1).map(block => block.split(endDelim)[0]);
}

function extractKeyValues(blockText: string): Record<string, string> {
  const result: Record<string, string> = {};
  blockText.split('\n').forEach(line => {
    const match = line.match(/^([A-Z_]+):\s*(.*)/);
    if (match) result[match[1].toLowerCase()] = match[2].trim();
  });
  return result;
}

// ─── OpenRouter call ─────────────────────────────────────────────────────────

interface OrMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function callOpenRouter(
  messages: OrMessage[],
  model?: string,
  maxTokens: number = 8192,
  temperature?: number
): Promise<{ text: string; annotations: any[] }> {
  const apiKey = getApiKey();
  const resolvedModel = model ?? getOnlineModel();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not set. Add it to .env.local.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  try {
    const resp = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:10000',
        'X-Title': 'UK Immigration Compass',
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages,
        max_tokens: maxTokens,
        ...(temperature !== undefined ? { temperature } : {}),
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`OpenRouter ${resp.status}: ${errText}`);
    }

    const json = await resp.json() as any;
    const choice = json.choices?.[0];
    const text: string = choice?.message?.content ?? '';
    const annotations: any[] = choice?.message?.annotations ?? [];
    return { text, annotations };
  } finally {
    clearTimeout(timer);
  }
}

function annotationsToSources(annotations: any[]): { web?: { uri?: string; title?: string } }[] {
  return annotations
    .filter(a => a?.type === 'url_citation' && a?.url_citation?.url)
    .map(a => ({ web: { uri: a.url_citation.url, title: a.url_citation.title ?? '' } }));
}

// ─── GOV.UK sponsor register (CSV-based, authoritative) ──────────────────────

interface RegisterEntry {
  name: string;
  town: string;
  typeRating: string;
  route: string;
}

const workerRegister: RegisterEntry[] = [];

// Companies whose latest historical-ledger event is 'removed' — i.e. no
// longer licensed. Built from the same pre-fetched ledger data as
// findExternalHistory, so a half-word search for a revoked company can
// surface it as a candidate too, not just currently-active ones.
const revokedRegister: RegisterEntry[] = [];

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let inQuotes = false;
  let cell = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cell += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(cell.replace(/^"|"$/g, '').trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.replace(/^"|"$/g, '').trim());
  return cells;
}

async function fetchRegisterCsvUrl(): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const resp = await fetch(
      'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers',
      { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UKImmigrationCompass/1.0)' } }
    );
    const html = await resp.text();
    const patterns = [
      /href="(https:\/\/assets\.publishing\.service\.gov\.uk[^"]+\.csv)"/i,
      /href="(\/government\/uploads[^"]+\.csv)"/i,
      /href="([^"]+Tier_2[^"]+\.csv)"/i,
    ];
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) return m[1].startsWith('http') ? m[1] : `https://www.gov.uk${m[1]}`;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Downloads and parses the live CSV from gov.uk into workerRegister. Not
// persisted to the shared cache: the parsed register is ~24MB, well over
// Upstash's 10MB free-tier max request size, so a Redis write would just
// fail silently on every cold start for no benefit. Exported so the nightly
// refresh cycle can call it directly, mirroring refreshUpdates/refreshPetitions/
// refreshSponsorNews — those are small enough to cache, this one isn't.
export async function refreshSponsorRegister(): Promise<void> {
  try {
    const csvUrl = await fetchRegisterCsvUrl();
    if (!csvUrl) { console.error('[Register] CSV URL not found on gov.uk'); return; }
    console.log('[Register] Downloading from', csvUrl);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    let text: string;
    try {
      const resp = await fetch(csvUrl, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      text = await resp.text();
    } finally {
      clearTimeout(timer);
    }

    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { console.error('[Register] CSV appears empty'); return; }

    const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('organisation') || h === 'name');
    const townIdx = headers.findIndex(h => h.includes('town') || h.includes('city'));
    const typeIdx = headers.findIndex(h => h.includes('type') && h.includes('rating'));
    const routeIdx = headers.findIndex(h => h.includes('route'));

    if (nameIdx === -1) { console.error('[Register] Name column not found. Headers:', headers.join(', ')); return; }

    workerRegister.length = 0;
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      const name = row[nameIdx]?.trim();
      if (!name) continue;
      workerRegister.push({
        name,
        town: townIdx >= 0 ? row[townIdx]?.trim() ?? '' : '',
        typeRating: typeIdx >= 0 ? row[typeIdx]?.trim() ?? '' : '',
        route: routeIdx >= 0 ? row[routeIdx]?.trim() ?? '' : '',
      });
    }
    console.log(`[Register] Loaded ${workerRegister.length} licensed sponsors`);
  } catch (err) {
    console.error('[Register] Failed to load:', err);
  }
}

function stripLegalSuffix(s: string): string {
  return s
    .replace(/\b(ltd|limited|llp|plc|inc|corp|group|holdings?|uk|international|services?|solutions?|consulting|consultants?|consultancy)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
}

// Lowercase, strip punctuation (&, ., ', -, etc.) and collapse whitespace, so
// "M&S", "M & S" and "M and S"-style variants line up for comparison.
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Pure function of `s`, called on every register/ledger entry across up to 4
// candidate-search tiers per query — memoized so a 142k-row scan doesn't
// recompute the same regex work 4x over. Bounded by register size (~160k
// entries total across current + revoked pools), not by query volume.
const canonicalNameCache = new Map<string, string>();
function canonicalName(s: string): string {
  const cached = canonicalNameCache.get(s);
  if (cached !== undefined) return cached;
  const result = stripLegalSuffix(normalizeName(s));
  canonicalNameCache.set(s, result);
  return result;
}

// Substring check anchored to word boundaries, so "tesco" doesn't match inside
// unrelated names like "atesco" purely because the characters happen to appear
// in sequence.
function containsAsWords(haystack: string, needle: string): boolean {
  return (' ' + haystack + ' ').includes(' ' + needle + ' ');
}

// Classic Levenshtein edit distance, used to tolerate typos in tier 5.
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  let prev = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    const curr = new Array(bl + 1);
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    prev = curr;
  }
  return prev[bl];
}

// High-confidence match: the query and the register entry are the same name,
// differing only in formatting, punctuation, or a legal suffix (Ltd/LLP/plc).
// Safe to treat as the same legal entity.
//
// The CSV has one row per (organisation, route) pair — 10.6% of companies
// sponsor under more than one route and so appear as multiple rows with the
// exact same name (e.g. "Capgemini UK PLC" has separate rows for Skilled
// Worker, Graduate Trainee, and Senior/Specialist Worker). Returns every row
// for the matched company, not just the first, so none of its routes get
// silently dropped.
function searchRegisterExact(name: string): RegisterEntry[] | null {
  if (workerRegister.length === 0) return null;
  const q = name.toLowerCase().trim();
  const qNorm = canonicalName(name);

  // 1. Exact match
  const exact = workerRegister.find(e => e.name.toLowerCase() === q);
  if (exact) {
    return workerRegister.filter(e => e.name.toLowerCase() === exact.name.toLowerCase());
  }

  // 2. Normalised exact (ignore Ltd/LLP/plc suffixes and punctuation). Once
  // the matching company is identified, group its rows by its own exact name
  // — not by canonical form — so we don't accidentally merge a different
  // company that happens to canonicalise the same way after suffix-stripping.
  if (qNorm.length > 1) {
    const norm = workerRegister.find(e => canonicalName(e.name) === qNorm);
    if (norm) {
      return workerRegister.filter(e => e.name.toLowerCase() === norm.name.toLowerCase());
    }
  }

  return null;
}

// Half/partial match — one name contains the other as a whole word or sequence
// of words, in either direction ("Deloitte" ⊂ "Deloitte LLP", "Tesco Stores Ltd
// UK" ⊃ "Tesco Stores"). Word-boundary anchored so "tesco" doesn't match inside
// an unrelated name like "atesco". Returns every match, closest-length first.
function collectSubstringMatches(qNorm: string, pool: RegisterEntry[]): RegisterEntry[] {
  if (qNorm.length < 3) return [];
  const matches: { entry: RegisterEntry; diff: number }[] = [];
  for (const e of pool) {
    const en = canonicalName(e.name);
    if (!en) continue;
    if (containsAsWords(en, qNorm) || containsAsWords(qNorm, en)) {
      matches.push({ entry: e, diff: Math.abs(en.length - qNorm.length) });
    }
  }
  matches.sort((a, b) => a.diff - b.diff);
  return matches.map(m => m.entry);
}

// All distinctive query words present in the entry name (word-based partial
// match). Short words (2-3 chars) are kept so acronym-style names (BT, IBM,
// HSBC) aren't filtered out. Each word is matched at a word boundary, not as a
// raw substring, for the same reason as collectSubstringMatches.
function collectWordOverlapMatches(qNorm: string, pool: RegisterEntry[]): RegisterEntry[] {
  const words = [...new Set(qNorm.split(/\s+/).filter(w => w.length >= 2))];
  if (words.length === 0) return [];
  const matches: RegisterEntry[] = [];
  for (const e of pool) {
    const en = canonicalName(e.name);
    if (!en) continue;
    const isMatch = words.length >= 2
      ? words.every(w => containsAsWords(en, w))
      : en.startsWith(words[0]); // single distinctive word: anchored at the start
    if (isMatch) matches.push(e);
  }
  return matches;
}

// Fuzzy match for typos / near-misses (bounded edit distance). Allows ~30% of
// characters to differ (min 2), so "Diloitte" still finds "Deloitte". Returns
// every match within the threshold, closest-distance first.
function collectFuzzyMatches(qNorm: string, pool: RegisterEntry[]): RegisterEntry[] {
  if (qNorm.length < 3) return [];
  const maxAllowed = Math.max(2, Math.floor(qNorm.length * 0.3));
  const firstChar = qNorm[0];
  const matches: { entry: RegisterEntry; dist: number }[] = [];
  for (const e of pool) {
    const en = canonicalName(e.name);
    if (!en) continue;
    // Cheap pre-filters (first letter, then length) so the DP only runs on
    // plausibly-close names — typos essentially never change the first
    // letter, and this is the difference between ~1s and ~10ms per query
    // across a 142k-row pool.
    if (en[0] !== firstChar || Math.abs(en.length - qNorm.length) > maxAllowed + 4) continue;
    const dist = levenshteinDistance(qNorm, en);
    if (dist <= maxAllowed) matches.push({ entry: e, dist });
  }
  matches.sort((a, b) => a.dist - b.dist);
  return matches.map(m => m.entry);
}

// Fuzzy match against individual WORDS of each candidate, not the whole
// canonical name. collectFuzzyMatches alone misses "tescoo" -> "Tesco Stores
// Limited": the query is 6 chars, the full canonical name is 12 ("tesco
// stores"), too big a length gap for the whole-string comparison. But "tescoo"
// is only 1 edit away from the word "tesco" inside it. Single-word queries
// only, and only tried when nothing else matched (last resort, and the most
// expensive tier — comparing against every word of every entry).
function collectFuzzyWordMatches(qNorm: string, pool: RegisterEntry[]): RegisterEntry[] {
  if (qNorm.length < 3 || qNorm.includes(' ')) return [];
  const maxAllowed = Math.max(1, Math.floor(qNorm.length * 0.25));
  const firstChar = qNorm[0];
  const matches: { entry: RegisterEntry; dist: number }[] = [];
  for (const e of pool) {
    const en = canonicalName(e.name);
    if (!en) continue;
    let bestDist = Infinity;
    for (const w of en.split(/\s+/)) {
      // Cheap checks before the DP call: typos essentially never change the
      // first letter, and length must be plausibly close. Without this,
      // scanning every word of every one of 142k entries takes ~1.7s per
      // query instead of tens of milliseconds.
      if (w.length < 3 || w[0] !== firstChar || Math.abs(w.length - qNorm.length) > maxAllowed + 2) continue;
      const dist = levenshteinDistance(qNorm, w);
      if (dist < bestDist) bestDist = dist;
    }
    if (bestDist <= maxAllowed) matches.push({ entry: e, dist: bestDist });
  }
  matches.sort((a, b) => a.dist - b.dist);
  return matches.map(m => m.entry);
}

function collectCandidatesFromPool(qNorm: string, pool: RegisterEntry[], limit: number): RegisterEntry[] {
  const seen = new Set<string>();
  const result: RegisterEntry[] = [];
  // Word-level fuzzy comes before whole-string fuzzy: a typo'd short brand
  // name ("tescoo") matching the word "tesco" inside "Tesco Stores Limited"
  // is a far stronger signal than a coincidental whole-string match to an
  // unrelated short company name ("Atesco Consultancy Ltd"). Without this
  // ordering, collectFuzzyMatches finds *something* first and the better
  // word-level match never gets a look-in.
  const tiers = [
    collectSubstringMatches(qNorm, pool),
    collectWordOverlapMatches(qNorm, pool),
    collectFuzzyWordMatches(qNorm, pool),
    collectFuzzyMatches(qNorm, pool),
  ];
  for (const list of tiers) {
    for (const e of list) {
      const key = e.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(e);
      if (result.length >= limit) return result;
    }
  }
  return result;
}

// Low-confidence candidates: names that only partially/fuzzily resemble the
// query. Good for surfacing typo-tolerant suggestions ("Diloitte" -> "Deloitte
// LLP"), but NOT safe to treat as a confirmed identity match — a name like
// "Johnson & Johnson Ltd" can legitimately be a different, separately-licensed
// entity from "Johnson & Johnson Medical Ltd" (or "Saltlake" from an unrelated
// "Saltlake Ltd GK Dental Hawick"), and string similarity alone can't tell them
// apart — even when there's only a single candidate. Callers must always let
// the user confirm which one (if any) they meant.
//
// Searches both the current register AND the revoked-company index, so a
// mangled half-word search for a revoked company ("TB Accountants &") can
// still surface the real (revoked) entity, not just unrelated active
// companies that happen to share a word. Each candidate is tagged with which
// pool it came from so the UI never presents a revoked suggestion as if it
// were live.
function searchRegisterCandidates(name: string, limit: number = 5): SponsorCandidate[] {
  const qNorm = canonicalName(name);
  const active = collectCandidatesFromPool(qNorm, workerRegister, limit).map(e => toCandidate(e, 'Licensed'));
  const revoked = collectCandidatesFromPool(qNorm, revokedRegister, limit).map(e => toCandidate(e, 'Revoked'));

  // Interleave rather than concatenate: without this, `limit` active matches
  // would crowd out a genuinely-relevant revoked one before it ever gets seen.
  const seen = new Set<string>();
  const result: SponsorCandidate[] = [];
  let ai = 0, ri = 0;
  while (result.length < limit && (ai < active.length || ri < revoked.length)) {
    if (ai < active.length) {
      const c = active[ai++];
      const key = c.name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); result.push(c); }
    }
    if (result.length >= limit) break;
    if (ri < revoked.length) {
      const c = revoked[ri++];
      const key = c.name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); result.push(c); }
    }
  }
  return result;
}

// ─── mock data (fallback when no API key and no disk cache) ──────────────────

const MOCK_UPDATES_TEXT = `|START|
TITLE: Skilled Worker Salary Threshold Increase
STATUS: Proposed
DATE: April 2024
CATEGORY: Work
SUMMARY: The Skilled Worker route salary threshold is being reviewed for potential adjustments.
DETAILS: The government has announced plans to review the minimum salary requirements for Skilled Worker visas to reflect current market conditions.
IMPACT: May affect thousands of workers and employers sponsoring international talent.
NEXT_STEPS: Check gov.uk for official announcement on implementation timeline.
TIMELINE: Review to conclude by Q2 2024
SEARCH_KEYWORDS: Skilled Worker, salary threshold, sponsorship
SOURCE_URL: https://www.gov.uk/browse/visas-immigration
|END|
|START|
TITLE: Graduate Route Extension Confirmed
STATUS: Passed
DATE: March 2024
CATEGORY: Student
SUMMARY: UK government extends the post-study work route for graduates.
DETAILS: The Graduate Route allows international students to work in the UK for 2 years after completing their studies.
IMPACT: Benefits thousands of international graduates seeking work experience in the UK.
NEXT_STEPS: International students can apply for the Graduate Route on gov.uk.
TIMELINE: Currently accepting applications
SEARCH_KEYWORDS: Graduate Route, post-study work, international students
SOURCE_URL: https://www.gov.uk/browse/visas-immigration
|END|
|START|
TITLE: Family Visa Minimum Income Threshold Raised to £29,000
STATUS: Passed
DATE: April 2024
CATEGORY: Family
SUMMARY: The minimum income requirement for British citizens sponsoring a partner on a family visa has increased from £18,600 to £29,000.
DETAILS: This change affects all new family visa applications. The government plans to further increase this to £34,500 and eventually £38,700 by early 2025.
IMPACT: British citizens and settled persons bringing partners to the UK face significantly higher financial barriers.
NEXT_STEPS: Affected families should seek immigration advice.
TIMELINE: Effective 11 April 2024; further increases planned for late 2024 and early 2025
SEARCH_KEYWORDS: family visa, minimum income, partner visa, spouse visa
SOURCE_URL: https://www.gov.uk/government/collections/family-migration-guidance
|END|
|START|
TITLE: Care Workers Barred from Bringing Dependents
STATUS: Passed
DATE: March 2024
CATEGORY: Work
SUMMARY: Overseas care workers can no longer bring dependants under the Health and Care Worker visa.
DETAILS: This change aims to reduce net migration. Care workers must now apply under the Skilled Worker route if they wish to bring family members.
IMPACT: Thousands of care workers must choose between working in the UK alone or not at all.
NEXT_STEPS: Employers must update recruitment policies and advise prospective hires accordingly.
TIMELINE: Effective 11 March 2024
SEARCH_KEYWORDS: Health and Care visa, care workers, dependents, social care
SOURCE_URL: https://www.gov.uk/government/collections/health-and-care-worker-visa-guidance
|END|`;

const MOCK: {
  updates: UpdatesResponse;
  sponsorNews: SponsorNewsItem[];
} = {
  updates: {
    items: parseUpdatesText(MOCK_UPDATES_TEXT),
    sources: [],
  },
  sponsorNews: [
    { title: 'CloudTech Solutions', date: '2024-04-20', summary: 'Recently added to Skilled Worker sponsor register', changeType: 'added' },
    { title: 'Global Staff Services', date: '2024-04-15', summary: 'License revoked due to compliance violations', changeType: 'revoked' },
  ],
};

// ─── prompts ─────────────────────────────────────────────────────────────────

const UPDATE_ITEM_FORMAT = `|START|
TITLE: [Short punchy headline]
STATUS: [Active | Passed | Proposed | Discussion]
DATE: [Stage date, e.g. "Effective 4th April"]
CATEGORY: [Work | Student | Family | Asylum | General]
SUMMARY: [2 clear sentences explaining the change with specific numbers if relevant]
DETAILS: [80-100 words explaining WHY, context, controversy]
TIMELINE: [Chronological key dates: "Date: Event; Date: Event"]
IMPACT: [1 sentence on who is affected]
NEXT_STEPS: [Specific future date or event, or "Awaiting government timeline"]
SOURCE_URL: [Direct deep link to gov.uk or parliament.uk document. Leave EMPTY if no specific link found]
SEARCH_KEYWORDS: [Exact search query to find this on Gov.uk]
|END|`;

const PROMPTS = {
  latestUpdates: `Search for the most recent official changes, House of Commons debates, MP statements, and Home Office announcements regarding UK immigration from the last 30-60 days.

STRICT SEARCH CONSTRAINT: Restrict results to OFFICIAL GOVERNMENT SOURCES (site:gov.uk or site:parliament.uk). Do not include information only found on news sites unless verified on a government site.

SPECIFIC TOPICS: Check for: "Skilled Worker Indefinite Leave to Remain (ILR) extension", "5-year route changes", "Settlement updates", "Salary threshold changes".

Find up to 8-10 updates, but only as many as are genuinely distinct — never invent or split coverage just to fill a quota.

DEDUPLICATION: If multiple changes trace back to the same underlying policy, speech, or announcement (e.g. the same new rule described in both a formal document and a plain-language statement), report it ONCE, in the category it fits best. Do not create separate entries that describe the same real-world change from different angles.

For EACH update use this EXACT format:

${UPDATE_ITEM_FORMAT}`,

  // Used to seed the archive for a category the daily search hasn't
  // surfaced anything for yet (e.g. no Family news in the last 30-60 days) —
  // looks back further so a quiet category still gets real past coverage
  // instead of sitting empty.
  categoryBackfill: (category: string) => `Search for official UK Home Office and Parliament changes specifically affecting the "${category}" immigration category (visas, rules, or announcements relevant to ${category.toLowerCase()} applicants) from the last 12 months.

STRICT SEARCH CONSTRAINT: Restrict results to OFFICIAL GOVERNMENT SOURCES (site:gov.uk or site:parliament.uk).

Find up to 4 genuinely distinct, real changes. If fewer than 4 real changes exist for this category in the last 12 months, report only the real ones — never invent or pad the list.

For EACH update use this EXACT format:

${UPDATE_ITEM_FORMAT}`,

  // Standalone classifier call, not the generation call — asking the search/
  // generation prompt to self-censor against a known-titles list was tested
  // live and failed (it re-generated a 4th paraphrase of an already-archived
  // story despite an explicit exclusion list). A narrow, single-purpose
  // judgment call on a candidate + existing titles is far more reliable.
  duplicateCheck: (candidateTitle: string, existingTitles: string[]) => `You are checking for duplicate news coverage of the same real-world policy event.

CANDIDATE HEADLINE: "${candidateTitle}"

EXISTING HEADLINES ALREADY IN THE ARCHIVE:
${existingTitles.map(t => `- ${t}`).join('\n')}

Does the candidate headline describe the SAME underlying real-world policy change as any existing headline, even worded completely differently, covering the same policy from a different angle (e.g. the announcement vs. the guidance/instructions that implement it vs. the legal instrument vs. a minister's statement about it)? Treat all of these as ONE event, not separate news.

Example: "Skilled Worker salary threshold raised to GBP 41,700" and "Home Office publishes updated sponsor guidance on new salary threshold" are the SAME event (one is the announcement, one is the implementing guidance for that same change) -> DUPLICATE.

Only answer NEW if the candidate is a genuinely different policy decision, not just a different document/angle covering the same decision.

Answer with exactly one word: DUPLICATE or NEW. No explanation.`,

  simplify: (text: string) => `You are an expert translator of legal jargon to plain English.
Rewrite the following text so that a non-native English speaker or someone without a law degree can easily understand it.
Keep the meaning accurate but change the tone to be helpful and clear.

Text to simplify:
"${text}"

Return only the simplified text, no preamble.`,

  sponsorNews: `Search for "recently added to UK sponsor register" and "UK sponsor license revoked companies" from the last 30-60 days.

Find companies that have been ADDED or REMOVED/REVOKED from the register.

Format each item as:
|NEWS_START|
COMPANY: [Company Name]
DATE: [Date of action]
TYPE: [ADDED or REVOKED or INFO]
DETAILS: [Brief detail]
|NEWS_END|

Return 5-6 items. No intro text.`,
};

// ─── refresh functions (always fetch live) ───────────────────────────────────

// A year of history plus a buffer, so nothing drops off the archive right at
// the one-year mark due to clock/timezone slop.
const ARCHIVE_MAX_AGE_MS = 370 * 24 * 60 * 60 * 1000;
// How many of the most recent archived items to surface per category on the
// homepage feed when today's fresh batch alone doesn't have that many.
const CATEGORY_DISPLAY_COUNT = 4;

// Asks a narrow, single-purpose classifier call whether a candidate headline
// covers the same real-world event as one already archived (same category
// only, to keep the comparison relevant and the call count bounded). Catches
// what newsDedupeKey's lexical key can't: independent AI calls (daily refresh
// vs. category backfill) phrasing the identical policy change differently
// (e.g. "Visa Brake Imposed on..." vs "Suspension of Visa Routes for...").
// Fails open (treats as not-a-duplicate) so a classifier hiccup never costs a
// real item.
async function isDuplicateEvent(candidateTitle: string, existingTitles: string[]): Promise<boolean> {
  if (existingTitles.length === 0) return false;
  try {
    // temperature: 0 — this is a yes/no judgment call, not creative
    // generation. Left at the default (sampling) temperature, the same
    // candidate/existing pair was observed to flip between DUPLICATE and NEW
    // across runs.
    const { text } = await callOpenRouter(
      [{ role: 'user', content: PROMPTS.duplicateCheck(candidateTitle, existingTitles) }],
      getBaseModel(),
      10,
      0
    );
    return text.trim().toUpperCase().startsWith('DUPLICATE');
  } catch (err) {
    console.error('[aiService] Duplicate check failed, keeping item:', err);
    return false;
  }
}

// Rebuilds both the archive (merge + prune) and the homepage display cache
// from a fresh set of parsed items. Shared by the main daily refresh and the
// thin-category backfill below, which both need to do this same bookkeeping.
async function mergeIntoArchiveAndRebuildDisplay(freshItems: NewsItem[], sources: any[]): Promise<UpdatesResponse> {
  const archive: NewsItem[] = (await cache.get('updates-archive')) || [];
  const existingKeys = new Set(archive.map(a => newsDedupeKey(a.title)));

  // Lexical pass first (cheap, catches literal repeats), then a semantic
  // pass against same-category archive titles. Sequential, not parallel: two
  // duplicate items can arrive in the very same AI response (seen live —
  // "Visa Brake Imposed on Student Visas for Four Countries" and "Visa Brake
  // Imposed on Four Countries Due to Asylum Claims" both came back from one
  // categoryBackfill call for Student). Checking in parallel against a fixed
  // archive snapshot misses that, since neither existed in the archive yet —
  // only comparing each candidate against the growing archive, one at a
  // time, catches duplicates within the same batch too.
  for (const item of freshItems) {
    const key = newsDedupeKey(item.title);
    if (existingKeys.has(key)) continue;
    const sameCategoryTitles = archive.filter(a => a.category === item.category).map(a => a.title);
    if (await isDuplicateEvent(item.title, sameCategoryTitles)) continue;
    archive.push(item);
    existingKeys.add(key);
  }

  const cutoff = Date.now() - ARCHIVE_MAX_AGE_MS;
  const pruned = archive.filter(a => a.parsedDate >= cutoff);
  pruned.sort((a, b) => b.parsedDate - a.parsedDate);
  await cache.set('updates-archive', pruned);

  // Build the homepage display set: the most recent items per category,
  // backfilled from the archive so a quiet category (e.g. no fresh Family
  // news today) still shows real past coverage instead of sitting empty —
  // rather than pressuring the AI to invent coverage to fill a quota.
  const display: NewsItem[] = [];
  for (const category of NEWS_CATEGORIES) {
    display.push(...pruned.filter(item => item.category === category).slice(0, CATEGORY_DISPLAY_COUNT));
  }
  display.sort((a, b) => b.parsedDate - a.parsedDate);

  const result: UpdatesResponse = { items: display, sources };
  await cache.set('updates', result);
  console.log(`[Cache] Refreshed: updates (${freshItems.length} fresh, ${pruned.length} archived, ${display.length} displayed)`);
  return result;
}

export async function refreshUpdates(): Promise<UpdatesResponse> {
  const { text, annotations } = await callOpenRouter(
    [{ role: 'user', content: PROMPTS.latestUpdates }],
    getOnlineModel(),
    12000
  );
  return mergeIntoArchiveAndRebuildDisplay(parseUpdatesText(text || ''), annotationsToSources(annotations));
}

// Cron-only: seeds any category still thin after the daily refresh with a
// one-off wider-window search per category, so it isn't stuck empty until
// real news happens to mention it. NOT called from getUpdates()'s cold-cache
// fallback — this can make up to 5 sequential AI calls, and a live request's
// timeout budget on Vercel is much tighter than the cron job's.
export async function backfillThinCategories(): Promise<void> {
  const archive: NewsItem[] = (await cache.get('updates-archive')) || [];
  const thinCategories = NEWS_CATEGORIES.filter(
    category => archive.filter(a => a.category === category).length < CATEGORY_DISPLAY_COUNT
  );
  if (thinCategories.length === 0) return;

  const existingKeys = new Set(archive.map(a => newsDedupeKey(a.title)));
  const freshItems: NewsItem[] = [];
  for (const category of thinCategories) {
    try {
      const { text } = await callOpenRouter(
        [{ role: 'user', content: PROMPTS.categoryBackfill(category) }],
        getOnlineModel(),
        6000
      );
      for (const item of parseUpdatesText(text || '')) {
        const key = newsDedupeKey(item.title);
        if (!existingKeys.has(key)) {
          freshItems.push(item);
          existingKeys.add(key);
        }
      }
    } catch (err) {
      console.error(`[aiService] Category backfill failed for ${category}:`, err);
    }
  }

  if (freshItems.length === 0) return;
  const cachedUpdates = (await cache.get('updates')) as UpdatesResponse | undefined;
  await mergeIntoArchiveAndRebuildDisplay(freshItems, cachedUpdates?.sources || []);
  console.log(`[Cache] Backfilled thin categories: ${thinCategories.join(', ')}`);
}

// ─── UK Parliament petitions (official API, no AI involved) ─────────────────

// Search terms broad enough to surface the real highest-signature immigration
// petitions (e.g. asylum/deportation petitions routinely outrank anything
// matching just "immigration"), deduped by petition id across terms below.
const PETITION_SEARCH_TERMS = ['immigration', 'visa', 'asylum', 'ILR', 'deportation'];

// Applied to the petition's title only (not its background text) — titles
// reliably state what the petition is actually about, while background text
// can mention "immigration" in passing on totally unrelated petitions (e.g. a
// petition about hate crime whose background blames "misinformation about
// minorities and immigration").
const PETITION_TITLE_RELEVANCE = /visa|immigrat|asylum|deport|migrant|\bILR\b|indefinite leave|settlement|refugee|sponsor|dependant|dependent|\bBNOs?\b|leave to remain|border control|foreign national/i;

interface ParliamentPetitionAttributes {
  action: string;
  background: string;
  signature_count: number;
  state: string;
  debate_outcome_at: string | null;
  debate_scheduled_on: string | null;
  government_response_at: string | null;
  response_threshold_reached_at: string | null;
}

async function fetchPetitionsForTerm(term: string): Promise<{ id: number; attrs: ParliamentPetitionAttributes }[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const resp = await fetch(`https://petition.parliament.uk/petitions.json?state=open&q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
    if (!resp.ok) return [];
    const json = await resp.json() as { data?: { id: number; attributes: ParliamentPetitionAttributes }[] };
    return (json.data || []).map(p => ({ id: p.id, attrs: p.attributes }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function petitionStatus(attrs: ParliamentPetitionAttributes): string {
  if (attrs.state !== 'open') return 'Closed';
  if (attrs.debate_outcome_at) return 'Debated in Parliament';
  if (attrs.debate_scheduled_on) return 'Debate Scheduled';
  if (attrs.government_response_at) return 'Government Responded';
  if (attrs.response_threshold_reached_at) return 'Awaiting Response';
  return 'Open';
}

// Parliament's API only exposes a live signature count, not history, so a
// real velocity graph has to be built from our own snapshots over time
// (one per calendar day, taken whenever this refreshes) rather than a single
// live call. Keeps the last 14 days.
async function recordSignatureSnapshot(petitions: PetitionItem[]): Promise<PetitionSignatureSnapshot[]> {
  const today = new Date().toISOString().slice(0, 10);
  const total = petitions.reduce((sum, p) => sum + (typeof p.signatures === 'number' ? p.signatures : 0), 0);
  const history: PetitionSignatureSnapshot[] = (await cache.get('petition-signature-history')) || [];
  const updated = [...history.filter(h => h.date !== today), { date: today, total }].slice(-14);
  await cache.set('petition-signature-history', updated);
  return updated;
}

export async function refreshPetitions(): Promise<PetitionsResult> {
  const byId = new Map<number, ParliamentPetitionAttributes>();
  for (const term of PETITION_SEARCH_TERMS) {
    const results = await fetchPetitionsForTerm(term);
    for (const { id, attrs } of results) {
      if (!PETITION_TITLE_RELEVANCE.test(attrs.action)) continue;
      if (!byId.has(id)) byId.set(id, attrs);
    }
  }

  const top = [...byId.entries()]
    .sort((a, b) => b[1].signature_count - a[1].signature_count)
    .slice(0, 6);

  const petitions: PetitionItem[] = top.map(([id, attrs]) => ({
    id: `pet-${id}`,
    title: attrs.action.trim(),
    summary: (attrs.background || '').trim().slice(0, 240),
    signatures: attrs.signature_count,
    status: petitionStatus(attrs),
    isActive: true,
    url: `https://petition.parliament.uk/petitions/${id}`,
  }));

  const signatureHistory = await recordSignatureSnapshot(petitions);
  const result: PetitionsResult = {
    petitions,
    sources: petitions.map(p => ({ web: { uri: p.url, title: p.title } })),
    signatureHistory,
  };
  await cache.set('petitions:v2', result);
  console.log(`[Cache] Refreshed: petitions (${petitions.length} found)`);
  return result;
}

export async function refreshSponsorNews(): Promise<SponsorNewsItem[]> {
  const { text } = await callOpenRouter(
    [{ role: 'user', content: PROMPTS.sponsorNews }],
    getOnlineModel(),
    2048
  );
  const items: SponsorNewsItem[] = [];
  const blocks = parseDelimitedBlocks(text || '', '|NEWS_START|', '|NEWS_END|');
  blocks.forEach(block => {
    const kv = extractKeyValues(block);
    if (!kv.company) return;
    let changeType: 'added' | 'revoked' | 'info' = 'info';
    const t = (kv.type || '').toUpperCase();
    if (t.includes('ADDED')) changeType = 'added';
    else if (t.includes('REVOKED') || t.includes('REMOVED')) changeType = 'revoked';
    items.push({
      title: stripMarkdown(kv.company),
      date: kv.date || 'Recent',
      summary: stripMarkdown(kv.details || ''),
      changeType,
    });
  });
  await cache.set('sponsor-news', items);
  console.log('[Cache] Refreshed: sponsor-news');
  return items;
}

// ─── public getters (serve from cache; refresh once if cold) ─────────────────

export async function getUpdates(): Promise<UpdatesResponse> {
  const cached = await cache.get('updates');
  // Only serve a cached value that matches the current {items: NewsItem[]}
  // contract. A stale pre-refactor value (the old {text, sources} shape) has no
  // `items` array — ignore it and refresh so we never hand the client a shape it
  // can't render. See services/aiService.getUpdates.test.ts.
  if (cached && Array.isArray(cached.items)) return cached;
  if (!getApiKey()) return MOCK.updates;
  try {
    return await refreshUpdates();
  } catch (err) {
    console.error('[aiService] refreshUpdates failed:', err);
    return MOCK.updates;
  }
}

// Full past-year archive for the "browse old updates" page — unlike
// getUpdates() this has no per-category cap, so it's the complete history
// rather than the balanced homepage sample.
export async function getUpdatesArchive(): Promise<NewsItem[]> {
  const archive: NewsItem[] = (await cache.get('updates-archive')) || [];
  return archive.length > 0 ? archive : MOCK.updates.items;
}

// Parliament's petitions API is public and needs no API key, unlike the other
// feeds — so this has no MOCK/no-key fallback, just cache-then-refresh.
export async function getPetitions(): Promise<PetitionsResult> {
  const cached = await cache.get('petitions:v2');
  if (cached) return cached;
  return refreshPetitions();
}

export async function getSponsorNews(): Promise<SponsorNewsItem[]> {
  const cached = await cache.get('sponsor-news');
  if (cached) return cached;
  if (!getApiKey()) return MOCK.sponsorNews;
  try {
    return await refreshSponsorNews();
  } catch (err) {
    console.error('[aiService] refreshSponsorNews failed:', err);
    return MOCK.sponsorNews;
  }
}

export async function simplify(complexText: string): Promise<{ simplified: string }> {
  if (!getApiKey()) return { simplified: `Simplified: ${complexText.substring(0, 200)}...` };
  const { text } = await callOpenRouter(
    [{ role: 'user', content: PROMPTS.simplify(complexText) }],
    getBaseModel(),
    4096
  );
  return { simplified: text || 'Could not simplify text.' };
}

// Builds a "Licensed" result from a confirmed register entry (or entries —
// the CSV has one row per sponsored route, so a company sponsoring under
// multiple routes appears as multiple rows with the exact same name). Only
// called for exact/normalised matches — fuzzy candidates are surfaced
// separately for the user to confirm, never auto-resolved (see
// searchRegisterCandidates for why even a single fuzzy candidate isn't safe
// to treat as a confirmed identity match).
async function buildLicensedResult(rows: RegisterEntry[]): Promise<SponsorCheckResult> {
  const reg = rows[0];
  const routes = [...new Set(rows.map(r => r.route).filter(Boolean))];
  const typeRatings = [...new Set(rows.map(r => r.typeRating).filter(Boolean))];

  // CSV format is "Worker (A rating)" / "Temporary Worker (A rating)", not
  // "Grade A" — match the actual text, same pattern as extractRatingFromTiers.
  const ratingMatch = typeRatings.join(' ').match(/\b([AB])\s*rating\b/i);
  const rating = ratingMatch ? `Grade ${ratingMatch[1].toUpperCase()}` : 'Unknown';

  // Grant date/history come from our own pre-fetched historical ledger, not a
  // live lookup — this never blocks on a network call.
  const records = await findCompanyRecords(reg.name);
  const history = buildHistoryFromRecords(records);

  return {
    companyName: reg.name,
    town: reg.town || 'Unknown',
    rating,
    routes,
    status: 'Licensed',
    natureOfBusiness: 'Unknown',
    dateGranted: history[0]?.date || 'Unknown',
    sponsorType: typeRatings.join(', ') || 'Worker',
    notes: 'Confirmed in the current UK Register of Licensed Sponsors (GOV.UK).',
    history,
  };
}

// ─── third-party historical register tracker (add/remove events, exact dates) ─

interface ExternalHistoryRecord {
  date: string;
  type: 'added' | 'removed' | 'updated' | 'none';
  data: { company: string; city?: string; county?: string; tiers?: string[] };
}

const historyBucketCache = new Map<string, ExternalHistoryRecord[]>();

// licensed-sponsors-uk.com (an independent tracker, not GOV.UK) buckets its
// scraped register snapshots by the first two letters of the company name —
// verified against several known companies (Deloitte -> de, Johnson -> jo).
function historyBucketKey(name: string): string | null {
  const letters = name.toLowerCase().replace(/[^a-z]/g, '');
  return letters.length >= 2 ? letters.slice(0, 2) : null;
}

const HISTORY_PRIMED_MARKER = 'history-buckets-primed-at';
const HISTORY_REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000; // ~20h, matches the nightly cadence with slack

function parseHistoryText(text: string): ExternalHistoryRecord[] {
  const records: ExternalHistoryRecord[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { records.push(JSON.parse(trimmed)); } catch { /* skip malformed line */ }
  }
  return records;
}

interface BucketRefreshStats { changed: number; unchanged: number; }

// Live fetch for exactly ONE bucket — used only by the prefetch job below,
// never at search time. checkSponsor must never make a live network call.
// Compares against what's already cached and only stashes the RAW TEXT into
// `pendingWrites` (for a single bulk persist at the end of the batch) when the
// content actually differs — most nights, most companies don't change, so
// this skips writing back data that's already correct.
async function fetchAndCacheHistoryBucket(
  prefix: string,
  pendingWrites: Record<string, string>,
  stats: BucketRefreshStats
): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const resp = await fetch(`https://res.licensed-sponsors-uk.com/history/${prefix}.txt`, { signal: ctrl.signal });
    if (!resp.ok) return false;
    const text = await resp.text();

    const cacheKey = `history-bucket:${prefix}`;
    const previous = await cache.get(cacheKey);
    if (previous === text) {
      stats.unchanged++;
      return true;
    }

    historyBucketCache.set(prefix, parseHistoryText(text));
    pendingWrites[cacheKey] = text;
    stats.changed++;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Fetches a list of bucket prefixes with bounded concurrency, returning the
// ones that failed so the caller can retry them.
async function fetchBucketBatch(
  prefixes: string[],
  concurrency: number,
  pendingWrites: Record<string, string>,
  stats: BucketRefreshStats
): Promise<string[]> {
  const failed: string[] = [];
  let idx = 0;
  async function worker() {
    while (idx < prefixes.length) {
      const prefix = prefixes[idx++];
      const ok = await fetchAndCacheHistoryBucket(prefix, pendingWrites, stats);
      if (!ok) failed.push(prefix);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return failed;
}

// Downloads the ENTIRE historical ledger (all 676 two-letter buckets, ~30MB
// of raw text measured) and reconciles it against our cache. This is the only
// place that talks to the third-party tracker — after this runs, checkSponsor
// only ever reads what's already been fetched, so a user search never waits
// on a live call. Only buckets whose content actually changed get written
// back (most nights that's a small fraction of the 676 — most companies
// don't move), batched into one cache.setMany() call rather than one write
// per bucket, which would otherwise rewrite the whole accumulated disk file
// on every call. A handful of buckets reliably time out under load on the
// first pass (this is someone's small side project, not a CDN built for bulk
// scraping), so failures get a couple of gentler, lower-concurrency retries
// before giving up.
export async function refreshAllHistoryBuckets(): Promise<void> {
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const prefixes: string[] = [];
  for (const a of letters) for (const b of letters) prefixes.push(a + b);

  console.log(`[SponsorHistory] Checking historical ledger (${prefixes.length} buckets)...`);
  const pendingWrites: Record<string, string> = {};
  const stats: BucketRefreshStats = { changed: 0, unchanged: 0 };
  let toRetry = await fetchBucketBatch(prefixes, 6, pendingWrites, stats);

  for (let attempt = 1; attempt <= 2 && toRetry.length > 0; attempt++) {
    console.log(`[SponsorHistory] Retry pass ${attempt}: ${toRetry.length} buckets`);
    toRetry = await fetchBucketBatch(toRetry, 3, pendingWrites, stats);
  }

  if (toRetry.length > 0) {
    console.warn(`[SponsorHistory] ${toRetry.length} buckets still missing after retries: ${toRetry.join(', ')}`);
  }

  console.log(`[SponsorHistory] ${stats.changed} buckets changed, ${stats.unchanged} unchanged — writing only the changed ones`);
  await cache.setMany({ ...pendingWrites, [HISTORY_PRIMED_MARKER]: Date.now() });
  console.log('[SponsorHistory] Historical ledger reconciled');
  await rebuildRevokedRegisterIndex();
}

// Cold-start entry point: only re-primes if the ledger is missing or stale,
// so restarting the dev server repeatedly doesn't re-fetch all 676 buckets
// every time. The revoked-company index is in-memory only, so it's rebuilt
// every boot regardless (cheap — reads only from cache, no live fetch).
async function primeHistoryBucketsIfStale(): Promise<void> {
  const lastPrimed = await cache.get(HISTORY_PRIMED_MARKER);
  if (typeof lastPrimed === 'number' && Date.now() - lastPrimed < HISTORY_REFRESH_INTERVAL_MS) {
    console.log('[SponsorHistory] Ledger already primed recently — skipping prefetch');
    await rebuildRevokedRegisterIndex();
    return;
  }
  await refreshAllHistoryBuckets();
}

// Search-time read: cache only, never a live fetch. If the ledger hasn't been
// primed yet for this bucket, this simply returns no data — checkSponsor
// treats that the same as "not found" rather than blocking on a network call.
async function fetchHistoryBucket(prefix: string): Promise<ExternalHistoryRecord[]> {
  if (historyBucketCache.has(prefix)) return historyBucketCache.get(prefix)!;
  const cached = await cache.get(`history-bucket:${prefix}`);
  if (typeof cached === 'string') {
    const records = parseHistoryText(cached);
    historyBucketCache.set(prefix, records);
    return records;
  }
  return [];
}

function extractRatingFromTiers(tiers: string[]): string {
  const m = tiers.join(' ').match(/\b([AB])\s*rating\b/i);
  return m ? `Grade ${m[1].toUpperCase()}` : 'Unknown';
}

function toCandidate(e: RegisterEntry, status: 'Licensed' | 'Revoked'): SponsorCandidate {
  return { name: e.name, town: e.town || 'Unknown', route: e.route || 'Unknown', status };
}

// Rebuilds the in-memory revoked-company index from our own pre-fetched
// ledger (never a live fetch — fetchHistoryBucket only reads from cache).
// Groups every record by canonical company name across all 676 buckets,
// keeps only the most recent event per company, and keeps the company if
// that event is a removal. Run after any ledger update, and once at boot
// even when the ledger didn't need refreshing (this index is in-memory only
// and doesn't survive a restart).
async function rebuildRevokedRegisterIndex(): Promise<void> {
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const prefixes: string[] = [];
  for (const a of letters) for (const b of letters) prefixes.push(a + b);

  const latestByCanon = new Map<string, ExternalHistoryRecord>();
  for (const prefix of prefixes) {
    const records = await fetchHistoryBucket(prefix);
    for (const r of records) {
      const canon = canonicalName(r.data.company);
      if (!canon) continue;
      const existing = latestByCanon.get(canon);
      if (!existing || new Date(r.date).getTime() > new Date(existing.date).getTime()) {
        latestByCanon.set(canon, r);
      }
    }
  }

  revokedRegister.length = 0;
  for (const r of latestByCanon.values()) {
    if (r.type !== 'removed') continue;
    const tiers = r.data.tiers || [];
    revokedRegister.push({
      name: r.data.company,
      town: r.data.city || '',
      typeRating: tiers.join(', '),
      route: tiers.length ? (tiers[0].includes(' - ') ? tiers[0].split(' - ').pop()!.trim() : tiers[0]) : '',
    });
  }
  console.log(`[SponsorHistory] Revoked-company index built: ${revokedRegister.length} entries`);
}

// A real sponsor-license revocation-then-relicensing takes months (a fresh
// application, vetting, etc.), never days. A 'removed' record immediately
// followed by an 'added' record within this window is not a real event —
// it's noise from a bad snapshot on the upstream scraper's side. Confirmed
// live: a single scrape glitch marked ~789 companies "removed" on
// 2026-06-05 and the same ~789 companies "added" again 3 days later, on
// 2026-06-08 — an exact-matching count, across effectively the whole
// register, that our ledger otherwise displays as a false revoke/re-grant
// blip on every affected company's history.
const SPURIOUS_REMOVAL_GAP_MS = 30 * 24 * 60 * 60 * 1000;

function stripSpuriousRemovals(records: ExternalHistoryRecord[]): ExternalHistoryRecord[] {
  const cleaned: ExternalHistoryRecord[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const next = records[i + 1];
    if (
      r.type === 'removed' &&
      next?.type === 'added' &&
      new Date(next.date).getTime() - new Date(r.date).getTime() < SPURIOUS_REMOVAL_GAP_MS
    ) {
      i++; // also skip the paired 'added' — it isn't a real re-grant either
      continue;
    }
    cleaned.push(r);
  }
  return cleaned;
}

// All historical records for one company, from our own pre-fetched ledger.
// Shared by buildLicensedResult (currently-licensed companies) and
// findExternalHistory (removed ones) — same data source, same lookup.
async function findCompanyRecords(companyName: string): Promise<ExternalHistoryRecord[]> {
  const prefix = historyBucketKey(companyName);
  if (!prefix) return [];
  const records = await fetchHistoryBucket(prefix);
  if (records.length === 0) return [];
  const qNorm = canonicalName(companyName);
  const sorted = records
    .filter(r => canonicalName(r.data.company) === qNorm)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return stripSpuriousRemovals(sorted);
}

function buildHistoryFromRecords(records: ExternalHistoryRecord[]): { date: string; status: string; details: string }[] {
  const history = records
    .filter(r => r.type === 'added' || r.type === 'removed')
    .map(r => ({
      date: r.date.slice(0, 10),
      status: r.type === 'added' ? 'Granted' : 'Revoked',
      details: r.type === 'added'
        ? 'Added to the UK Register of Licensed Sponsors.'
        : 'Removed from the UK Register of Licensed Sponsors (the public register does not disclose whether this was revocation, surrender, or expiry).',
    }));
  if (!history.some(h => h.status === 'Granted') && records.length > 0) {
    history.unshift({
      date: records[0].date.slice(0, 10),
      status: 'Granted',
      details: 'First observed on the UK Register of Licensed Sponsors (exact grant date unknown).',
    });
  }
  return history;
}

// Cross-checks a company absent from the current CSV register against our
// pre-fetched historical ledger. GOV.UK itself publishes no "removed
// sponsors" list, so this is the only source of truth for why a company
// disappeared. Returns null if it's not in the ledger either, or if the
// ledger disagrees with the company being absent from our current register.
async function findExternalHistory(companyName: string): Promise<SponsorCheckResult | null> {
  const matches = await findCompanyRecords(companyName);
  if (matches.length === 0) return null;

  const latest = matches[matches.length - 1];
  if (latest.type !== 'removed') return null;

  const history = buildHistoryFromRecords(matches);
  const lastKnownTiers = [...matches].reverse().find(r => r.data.tiers && r.data.tiers.length)?.data.tiers || [];

  return {
    companyName: latest.data.company,
    town: latest.data.city || 'Unknown',
    rating: extractRatingFromTiers(lastKnownTiers),
    routes: [...new Set(lastKnownTiers.map(t => (t.includes(' - ') ? t.split(' - ').pop()!.trim() : t)))],
    status: 'Revoked',
    natureOfBusiness: 'Unknown',
    dateGranted: history[0]?.date || 'Unknown',
    sponsorType: lastKnownTiers.join(', ') || 'Worker',
    notes: `Removed from the UK Register of Licensed Sponsors on ${latest.date.slice(0, 10)}.`,
    history,
  };
}

// Strips common conversational wrapping ("is X a real company", "does X
// sponsor visas", "the X company", "check X please") down to what's actually
// the company name. Only ever used as a fallback after a raw search finds
// nothing — a query that already resolves on its own is never rewritten, so
// this can't turn a working exact search into a wrong one. Returns null if
// nothing was stripped (no point retrying an identical string).
function simplifyConversationalQuery(input: string): string | null {
  let s = input.trim().replace(/[?!.]+$/g, '').trim();
  if (!s) return null;
  s = s.replace(/\s+(please|pls|thanks|thank you)$/i, '').trim();

  const leadingPatterns = [
    /^is there a company called\s+/i,
    /^is there an?\s+/i,
    /^(the )?company called\s+/i,
    /^(check|verify|search(\s+for)?|find|look\s*up|tell me about|what about|who is|who sponsors|can you check)\s+/i,
    /^sponsors?(hip)? for\s+/i,
    /^(is|does|can|could|will|has|was)\s+/i,
    /^the\s+/i,
  ];
  for (const pat of leadingPatterns) {
    const next = s.replace(pat, '').trim();
    if (next && next !== s) { s = next; break; }
  }

  const trailingPatterns = [
    /\s+sponsors?\s+(me|visas?|jobs?)$/i,
    /\s+visa sponsors?$/i,
    /\s+(a\s+)?real company$/i,
    /\s+(a\s+)?licen[cs]ed sponsors?$/i,
    /\s+hold(ing)?\s+a\s+(sponsor\s+)?licen[cs]e$/i,
    /\s+(the\s+)?company$/i,
  ];
  for (const pat of trailingPatterns) {
    const next = s.replace(pat, '').trim();
    if (next && next !== s) { s = next; break; }
  }

  s = s.trim();
  if (!s || s.toLowerCase() === input.trim().toLowerCase()) return null;
  return s;
}

export async function checkSponsor(companyName: string): Promise<SponsorCheckResult> {
  const result = await checkSponsorOnce(companyName);
  if (result.status !== 'Not Found') return result;

  // Raw query found nothing — a naive/conversational phrasing ("is tesco a
  // real company") often confuses the fuzzy matcher, since filler words like
  // "the"/"a"/"real"/"company" coincidentally match unrelated companies. Try
  // again with the wrapping stripped, and only use that result if it actually
  // found something better than the original blank "Not Found".
  const simplified = simplifyConversationalQuery(companyName);
  if (!simplified) return result;

  const retry = await checkSponsorOnce(simplified);
  const retryFoundSomething = retry.status !== 'Not Found' || (retry.candidates && retry.candidates.length > 0);
  return retryFoundSomething ? retry : result;
}

// Versioned so a search-logic change (like this one) can't be masked by a
// previously-cached result forever — bump the version instead of needing to
// manually clear disk/Redis caches after every fix. Combined with the TTL
// below so future changes self-heal without a version bump too.
const SPONSOR_CACHE_VERSION = 'v3';
const SPONSOR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function checkSponsorOnce(companyName: string): Promise<SponsorCheckResult> {
  const cacheKey = `sponsor:${SPONSOR_CACHE_VERSION}:${companyName.toLowerCase().trim()}`;
  const cached = await cache.get(cacheKey);
  if (cached && cache.ageMs(cacheKey) < SPONSOR_CACHE_TTL_MS) return cached;

  // 1. Exact/normalised register match — confirmed identity, no ambiguity.
  const exact = searchRegisterExact(companyName);
  if (exact) {
    const result = await buildLicensedResult(exact);
    await cache.set(cacheKey, result);
    return result;
  }

  // 2. No exact match in the current register — check our own pre-fetched
  // historical ledger for a confirmed removal (also an exact canonical match,
  // just against the revoked pool instead of the current one). Everything
  // from here on reads only from our own data; nothing in checkSponsor ever
  // makes a live call.
  const externalHistory = await findExternalHistory(companyName);
  if (externalHistory) {
    await cache.set(cacheKey, externalHistory);
    return externalHistory;
  }

  // 3. Not found anywhere in our data — a plain, friendly message, with
  // similarly-named suggestions (from either the current register or the
  // revoked index) since we genuinely don't have a confirmed identity match.
  const candidateEntries = searchRegisterCandidates(companyName, 5);
  const result: SponsorCheckResult = {
    companyName,
    town: 'Unknown',
    rating: 'Unknown',
    routes: [],
    status: 'Not Found',
    natureOfBusiness: 'Unknown',
    dateGranted: 'Unknown',
    sponsorType: 'Unknown',
    notes: "We couldn't find this company in our records. It may never have held a UK sponsor licence, the name might be spelled differently, or it isn't in our data yet.",
    history: [],
    candidates: candidateEntries.length ? candidateEntries : undefined,
  };
  await cache.set(cacheKey, result);
  return result;
}

// ─── startup + daily scheduling ──────────────────────────────────────────────

function msUntilNextMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

async function runDailyRefresh(): Promise<void> {
  console.log('[Cache] Running daily midnight refresh...');
  await refreshUpdates().catch(err => console.error('[Cache] refreshUpdates failed:', err));
  await Promise.allSettled([
    backfillThinCategories(),
    refreshPetitions(),
    refreshSponsorNews(),
    refreshSponsorRegister(),
    refreshAllHistoryBuckets(),
  ]);
  console.log('[Cache] Daily refresh complete');
}

// Loads the current register + revoked index into THIS process's memory if
// they aren't already there. Needed because workerRegister/revokedRegister
// are in-memory only (too big for the shared Redis cache) — on Vercel,
// api/sponsor-status.ts runs as its own isolated function, separate from the
// cron job that calls refreshSponsorRegister() on its own schedule, so
// nothing else ever populates this function's copy. Memoized so concurrent
// requests on the same cold container share one in-flight load instead of
// each kicking off their own GOV.UK fetch.
let sponsorDataLoadPromise: Promise<void> | null = null;
export function ensureSponsorDataLoaded(): Promise<void> {
  if (workerRegister.length > 0 && revokedRegister.length > 0) return Promise.resolve();
  if (!sponsorDataLoadPromise) {
    sponsorDataLoadPromise = Promise.all([
      workerRegister.length === 0 ? refreshSponsorRegister() : Promise.resolve(),
      revokedRegister.length === 0 ? primeHistoryBucketsIfStale() : Promise.resolve(),
    ]).then(() => {});
  }
  return sponsorDataLoadPromise;
}

export function initCache(): void {
  cache.load();

  // The sponsor register and historical ledger are what checkSponsor reads —
  // load them regardless of whether an AI key is configured, since neither
  // needs one.
  ensureSponsorDataLoaded().catch(err => console.error('[Register] Background load failed:', err));

  if (!getApiKey()) {
    console.log('[Cache] No API key — skipping AI-backed feed warm-up; mock data will be used for updates/petitions/news');
  } else if (!process.env.KV_REST_API_URL) {
    // On Vercel, the midnight cron job + Redis handle cache refresh; skip warm-up to avoid extra API calls.
    // On local/Render (no KV_REST_API_URL), warm up any feeds not yet in the disk cache.
    for (const [key, refreshFn] of [
      ['updates', refreshUpdates],
      ['petitions', refreshPetitions],
      ['sponsor-news', refreshSponsorNews],
    ] as [string, () => Promise<any>][]) {
      if (!cache.has(key)) {
        console.log(`[Cache] Cold start — fetching ${key} in background`);
        refreshFn().catch(err => console.error(`[Cache] Warm-up failed for ${key}:`, err));
      } else {
        console.log(`[Cache] ${key} already cached — serving from disk`);
      }
    }
  } else {
    console.log('[Cache] KV_REST_API_URL detected — skipping warm-up (cron handles refresh)');
  }

  // Schedule first run at local midnight, then every 24h
  const msToMidnight = msUntilNextMidnight();
  console.log(`[Cache] Next midnight refresh in ${Math.round(msToMidnight / 60000)} minutes`);
  setTimeout(() => {
    runDailyRefresh();
    setInterval(runDailyRefresh, 24 * 60 * 60 * 1000);
  }, msToMidnight);
}
