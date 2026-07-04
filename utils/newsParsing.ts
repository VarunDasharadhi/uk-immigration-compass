/**
 * newsParsing.ts
 * Shared between the server (aiService.ts, building the updates archive) and
 * the client (rendering news cards) — safe in both Node and browser.
 */
import { stripMarkdown } from './text.js';
import { NewsItem } from '../types.js';

export function normalizeCategory(cat: string): NewsItem['category'] {
  if (!cat) return 'General';
  const c = cat.toLowerCase();
  if (c.includes('work') || c.includes('skilled') || c.includes('salary') || c.includes('occupation')) return 'Work';
  if (c.includes('student') || c.includes('graduate') || c.includes('university') || c.includes('study')) return 'Student';
  if (c.includes('family') || c.includes('spouse') || c.includes('partner') || c.includes('dependent')) return 'Family';
  if (c.includes('asylum') || c.includes('rwanda') || c.includes('boat') || c.includes('refugee')) return 'Asylum';
  return 'General';
}

export function cleanUrl(url: string): string {
  if (!url) return '';

  // 1. Try to extract from Markdown [Link](url)
  const mdMatch = url.match(/\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
  if (mdMatch && mdMatch[1]) {
    return mdMatch[1];
  }

  // 2. Find url-like string.
  // Matches: http://..., https://..., www...., or domains ending in gov.uk/parliament.uk
  // Explicitly allow subdomains like assets.publishing.service.gov.uk
  const match = url.match(/(https?:\/\/[^\s\)]+|www\.[^\s\)]+|[a-zA-Z0-9-]+\.(?:[a-zA-Z0-9-]+\.)?(gov\.uk|parliament\.uk|legislation\.gov\.uk)[^\s\)]*)/i);
  if (!match) return '';

  let link = match[0];

  // 3. Cleanup trailing punctuation that often gets caught (e.g., period at end of sentence)
  link = link.replace(/[.,;:\>\]\}\)\"']+$/, '');

  // 4. Ensure protocol
  if (!link.startsWith('http')) {
    link = 'https://' + link;
  }

  return link;
}

export function isOfficialUrl(url: string): boolean {
  if (!url) return false;
  try {
    const urlToCheck = url.startsWith('http') ? url : `https://${url}`;
    const urlObj = new URL(urlToCheck);
    const hostname = urlObj.hostname.toLowerCase();

    // Dotted suffixes only — a bare "gov.uk" would match "notgov.uk" via
    // endsWith with no dot boundary, letting a lookalike domain pass as official.
    const officialDomains = [
      '.gov.uk',
      '.parliament.uk',
      'legislation.gov.uk',
      'nationalarchives.gov.uk',
    ];

    const isOfficial = officialDomains.some(d => hostname === d || hostname.endsWith(d));

    // Filter out generic homepages to ensure we have a deep link
    const isGenericHomepage = urlObj.pathname === '/' || urlObj.pathname === '';

    return isOfficial && !isGenericHomepage;
  } catch {
    return false;
  }
}

// Best-effort extraction of a real calendar date from AI-written free text
// like "Effective 26 March 2026" or "Announced 5th March 2026". Falls back to
// the given timestamp (usually "now") when nothing parses, so items without a
// recognisable date still sort sensibly instead of crashing the sort.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function parseNewsDate(dateStr: string, fallbackMs: number): number {
  if (!dateStr) return fallbackMs;
  const match = dateStr.toLowerCase().match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = MONTHS.indexOf(match[2]);
    const year = parseInt(match[3], 10);
    if (month !== -1) {
      const ms = Date.UTC(year, month, day);
      if (!Number.isNaN(ms)) return ms;
    }
  }
  return fallbackMs;
}

// Normalized key used to tell whether a freshly-generated update describes
// the same real-world event as one already in the archive (e.g. the AI
// re-surfacing yesterday's news in today's "last 30-60 days" search) —
// lowercased, punctuation stripped, whitespace collapsed.
export function newsDedupeKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const NEWS_CATEGORIES: NewsItem['category'][] = ['Work', 'Student', 'Family', 'Asylum', 'General'];

// Parses the AI's `|START| KEY: value ... |END|` block format into structured
// items. Shared so the server can build the archive from the same parsing
// logic the client used to run inline.
export function parseUpdatesText(text: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = (text || '').split('|START|').slice(1);

  blocks.forEach((block: string, index: number) => {
    const cleanBlock = block.split('|END|')[0];
    const lines = cleanBlock.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const item: Record<string, string> = {};
    let currentKey = '';

    lines.forEach((line: string) => {
      const keyMatch = line.match(/^[\*]*\s*(TITLE|STATUS|DATE|CATEGORY|SUMMARY|DETAILS|TIMELINE|IMPACT|NEXT_STEPS|SEARCH_KEYWORDS|SOURCE_URL)[\*]*\s*:\s*(.*)/i);
      if (keyMatch) {
        const key = keyMatch[1].toUpperCase();
        const value = keyMatch[2];
        item[key] = value;
        currentKey = key;
      } else if (currentKey) {
        item[currentKey] += ' ' + line;
      }
    });

    if (item['TITLE']) {
      const now = Date.now();
      const title = stripMarkdown(item['TITLE']);
      items.push({
        id: `news-${now}-${index}`,
        title,
        status: item['STATUS'] || 'Discussion',
        date: item['DATE'] || 'Recent',
        parsedDate: parseNewsDate(item['DATE'] || '', now),
        category: normalizeCategory(item['CATEGORY'] || 'General'),
        summary: stripMarkdown(item['SUMMARY'] || 'No details provided.'),
        details: stripMarkdown(item['DETAILS'] || item['SUMMARY'] || 'No detailed analysis available.'),
        impact: stripMarkdown(item['IMPACT'] || 'See details.'),
        nextSteps: stripMarkdown(item['NEXT_STEPS'] || 'Check official sources.'),
        timeline: item['TIMELINE'] || '',
        searchKeywords: item['SEARCH_KEYWORDS'] || item['TITLE'],
        sourceUrl: cleanUrl(item['SOURCE_URL'] || ''),
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      });
    }
  });

  return items;
}
