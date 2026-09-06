/**
 * industryMapRefresh.ts
 * Server-side port of scripts/build-industry-map.ts so the sponsor industry
 * map can refresh itself instead of waiting for a manual `npm run
 * build:industry-map`. Joins the GOV.UK sponsor register against Companies
 * House's free monthly bulk company dump by canonical name and produces the
 * same artifact shape the directory already consumes.
 *
 * The result is written to the shared cache (Redis on Vercel) as
 * 'industry-map:override' — sponsorDirectory picks it up on the refreshing
 * instance immediately and on every other instance at their next cold start.
 * The committed data/sponsor-industry-map.json remains the fallback if this
 * refresh has never succeeded (e.g. the bulk download didn't fit in the
 * serverless /tmp budget).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import * as unzipper from 'unzipper';

import * as cache from './cache.js';
import { fetchRegisterCsvUrl, parseCsvLine } from './aiService.js';
import { canonicalName } from '../utils/canonicalName.js';
import { sectionForSicCode, SIC_SECTION_LABELS, SicSectionId } from './sicSections.js';
import { applyIndustryMapOverride } from './sponsorDirectory.js';

const CH_BULK_INDEX_URL = 'https://download.companieshouse.gov.uk/en_output.html';
const OVERRIDE_KEY = 'industry-map:override';
// Companies House publishes a fresh bulk file monthly; anything newer than 28
// days is considered current so the daily cron no-ops most of the month.
const REFRESH_INTERVAL_MS = 28 * 24 * 60 * 60 * 1000;

interface IndustryMapArtifact {
  version: number;
  generatedAt: string;
  source: string;
  sections: Record<string, string>;
  companies: Record<string, string[]>;
}

interface JoinResult {
  companies: Map<SicSectionId, string[]>;
  matched: number;
  conflicted: number;
  totalRegisterNames: number;
}

async function downloadRegisterNames(): Promise<Set<string>> {
  const csvUrl = await fetchRegisterCsvUrl();
  if (!csvUrl) throw new Error('Could not find the register CSV URL on gov.uk');
  const resp = await fetch(csvUrl);
  if (!resp.ok) throw new Error(`Register download failed: HTTP ${resp.status}`);
  const text = await resp.text();

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const nameIdx = headers.findIndex(h => h.includes('organisation') || h === 'name');
  if (nameIdx === -1) throw new Error('Register CSV has no name column.');

  const names = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const name = parseCsvLine(lines[i])[nameIdx]?.trim();
    if (name) names.add(canonicalName(name));
  }
  console.log(`[IndustryMap] ${names.size} distinct sponsor names to match.`);
  return names;
}

async function findBulkDataUrl(): Promise<string> {
  const resp = await fetch(CH_BULK_INDEX_URL);
  if (!resp.ok) throw new Error(`Could not load Companies House download index: HTTP ${resp.status}`);
  const html = await resp.text();
  const match = html.match(/href="(BasicCompanyDataAsOneFile-[^"]+\.zip)"/i);
  if (!match) throw new Error('Could not find a BasicCompanyDataAsOneFile zip link on the CH download page.');
  return `https://download.companieshouse.gov.uk/${match[1]}`;
}

async function downloadToTempFile(url: string): Promise<string> {
  const dest = path.join(os.tmpdir(), 'ch-bulk-data.zip');
  const resp = await fetch(url);
  if (!resp.ok || !resp.body) throw new Error(`Bulk data download failed: HTTP ${resp.status}`);
  await pipeline(Readable.fromWeb(resp.body as any), fs.createWriteStream(dest));
  return dest;
}

// Same rules as the offline build: stream the ~2.5GB uncompressed CSV row by
// row, keep only register names, drop canonical names whose duplicate rows
// disagree on SIC section rather than guessing.
async function joinAgainstBulkData(zipPath: string, registerNames: Set<string>): Promise<JoinResult> {
  const directory = await unzipper.Open.file(zipPath);
  const csvEntry = directory.files.find(f => f.path.toLowerCase().endsWith('.csv'));
  if (!csvEntry) throw new Error('No CSV file found inside the Companies House bulk data zip.');

  const sectionByName = new Map<string, SicSectionId>();
  const conflicted = new Set<string>();

  const rl = readline.createInterface({ input: csvEntry.stream(), crlfDelay: Infinity });

  let headerCols: string[] | null = null;
  let nameIdx = -1;
  let sicIdx = -1;
  let rowCount = 0;

  for await (const line of rl) {
    if (!headerCols) {
      headerCols = parseCsvLine(line).map(h => h.trim());
      nameIdx = headerCols.indexOf('CompanyName');
      sicIdx = headerCols.indexOf('SICCode.SicText_1');
      if (nameIdx === -1 || sicIdx === -1) {
        throw new Error(`Bulk data CSV missing expected columns. Headers: ${headerCols.join(', ')}`);
      }
      continue;
    }

    rowCount++;
    if (rowCount % 1_000_000 === 0) console.log(`[IndustryMap] ...${rowCount.toLocaleString()} rows scanned`);

    const row = parseCsvLine(line);
    const rawName = row[nameIdx];
    if (!rawName) continue;
    const canon = canonicalName(rawName);
    if (!registerNames.has(canon)) continue;

    const section = sectionForSicCode(row[sicIdx]);
    if (!section) continue;

    const existing = sectionByName.get(canon);
    if (existing === undefined) {
      sectionByName.set(canon, section);
    } else if (existing !== section) {
      conflicted.add(canon);
    }
  }

  for (const canon of conflicted) sectionByName.delete(canon);

  const companies = new Map<SicSectionId, string[]>();
  for (const [canon, section] of sectionByName) {
    if (!companies.has(section)) companies.set(section, []);
    companies.get(section)!.push(canon);
  }

  return { companies, matched: sectionByName.size, conflicted: conflicted.size, totalRegisterNames: registerNames.size };
}

/**
 * Applies the stored override map (if any) to this instance. Called once at
 * server boot so warm-start pickups from other instances' rebuilds are
 * reflected without waiting for this instance's own monthly turn.
 */
export async function applyStoredIndustryMap(): Promise<void> {
  try {
    const stored = await cache.get(OVERRIDE_KEY);
    if (stored?.artifact) {
      applyIndustryMapOverride(stored.artifact);
      console.log(`[IndustryMap] Applied override generated ${stored.artifact.generatedAt}`);
    }
  } catch {
    // No stored override (or cache unreachable) — the committed artifact stays.
  }
}

export async function refreshIndustryMap(): Promise<{ skipped?: boolean; matched?: number; generatedAt?: string }> {
  const age = cache.ageMs(OVERRIDE_KEY);
  if (age < REFRESH_INTERVAL_MS) {
    return { skipped: true };
  }
  console.log('[IndustryMap] Refreshing sponsor industry map from Companies House...');

  const registerNames = await downloadRegisterNames();
  const bulkUrl = await findBulkDataUrl();
  const zipPath = await downloadToTempFile(bulkUrl);

  let result: JoinResult;
  try {
    result = await joinAgainstBulkData(zipPath, registerNames);
  } finally {
    fs.unlink(zipPath, () => {});
  }

  const companiesOut: Record<string, string[]> = {};
  for (const [section, names] of result.companies) {
    companiesOut[section] = names.sort();
  }

  const artifact: IndustryMapArtifact = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: bulkUrl.split('/').pop() || 'BasicCompanyDataAsOneFile.zip',
    sections: SIC_SECTION_LABELS,
    companies: companiesOut,
  };

  cache.set(OVERRIDE_KEY, { artifact, builtAt: Date.now() });
  applyIndustryMapOverride(artifact);

  const matchRate = ((result.matched / result.totalRegisterNames) * 100).toFixed(1);
  console.log(`[IndustryMap] Refreshed: matched ${result.matched} / ${result.totalRegisterNames} (${matchRate}%), generated ${artifact.generatedAt}`);
  return { matched: result.matched, generatedAt: artifact.generatedAt };
}
