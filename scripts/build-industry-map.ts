/**
 * build-industry-map.ts
 * Offline precompute: joins the GOV.UK sponsor register against Companies
 * House's free monthly bulk company-data dump by canonical name, rolls each
 * matched company's primary SIC code up to its SIC 2007 section, and emits
 * data/sponsor-industry-map.json for the sponsor directory to serve.
 *
 * Run manually (`npm run build:industry-map`) whenever the industry data
 * should be refreshed — Companies House publishes a new bulk file roughly
 * monthly. No live Companies House API calls and no rate limits: this reads
 * CH's public bulk-download files directly.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import * as unzipper from 'unzipper';

import { fetchRegisterCsvUrl, parseCsvLine } from '../services/aiService.js';
import { canonicalName } from '../utils/canonicalName.js';
import { sectionForSicCode, SIC_SECTION_LABELS, SicSectionId } from '../services/sicSections.js';

const CH_BULK_INDEX_URL = 'https://download.companieshouse.gov.uk/en_output.html';
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'sponsor-industry-map.json');

async function downloadRegisterNames(): Promise<Set<string>> {
  console.log('[1/4] Downloading GOV.UK sponsor register...');
  const csvUrl = await fetchRegisterCsvUrl();
  if (!csvUrl) throw new Error('Could not find the register CSV URL on gov.uk');
  const resp = await fetch(csvUrl);
  if (!resp.ok) throw new Error(`Register download failed: HTTP ${resp.status}`);
  const text = await resp.text();

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const nameIdx = headers.findIndex(h => h.includes('organisation') || h === 'name');
  if (nameIdx === -1) throw new Error(`Register CSV has no name column. Headers: ${headers.join(', ')}`);

  const names = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const name = parseCsvLine(lines[i])[nameIdx]?.trim();
    if (name) names.add(canonicalName(name));
  }
  console.log(`      ${names.size} distinct sponsor names to match.`);
  return names;
}

async function findBulkDataUrl(): Promise<string> {
  console.log('[2/4] Locating latest Companies House bulk data file...');
  const resp = await fetch(CH_BULK_INDEX_URL);
  if (!resp.ok) throw new Error(`Could not load Companies House download index: HTTP ${resp.status}`);
  const html = await resp.text();
  const match = html.match(/href="(BasicCompanyDataAsOneFile-[^"]+\.zip)"/i);
  if (!match) throw new Error('Could not find a BasicCompanyDataAsOneFile zip link on the CH download page.');
  const url = `https://download.companieshouse.gov.uk/${match[1]}`;
  console.log(`      Found: ${match[1]}`);
  return url;
}

async function downloadToTempFile(url: string): Promise<string> {
  console.log('[3/4] Downloading Companies House bulk data (~450MB — this takes a while)...');
  const dest = path.join(os.tmpdir(), 'ch-bulk-data.zip');
  const resp = await fetch(url);
  if (!resp.ok || !resp.body) throw new Error(`Bulk data download failed: HTTP ${resp.status}`);
  await pipeline(Readable.fromWeb(resp.body as any), fs.createWriteStream(dest));
  console.log(`      Downloaded to ${dest}`);
  return dest;
}

interface JoinResult {
  companies: Map<SicSectionId, string[]>;
  matched: number;
  conflicted: number;
  totalRegisterNames: number;
}

// Streams the bulk CSV row by row (never buffered whole — it's ~2.5GB
// uncompressed) and keeps only rows whose canonical name is in the register.
// A canonical name seen twice with two DIFFERENT sections (two distinct real
// companies that happen to canonicalize the same way, e.g. after
// suffix-stripping) is dropped to the Unknown bucket rather than guessed at.
async function joinAgainstBulkData(zipPath: string, registerNames: Set<string>): Promise<JoinResult> {
  console.log('[4/4] Streaming and matching bulk data against the register...');
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
    if (rowCount % 1_000_000 === 0) console.log(`      ...${rowCount.toLocaleString()} rows scanned`);

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

async function main() {
  const registerNames = await downloadRegisterNames();
  const bulkUrl = await findBulkDataUrl();
  const zipPath = await downloadToTempFile(bulkUrl);

  let result: JoinResult;
  try {
    result = await joinAgainstBulkData(zipPath, registerNames);
  } finally {
    fs.unlinkSync(zipPath);
  }

  const companiesOut: Record<string, string[]> = {};
  for (const [section, names] of result.companies) {
    companiesOut[section] = names.sort();
  }

  const artifact = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: bulkUrl.split('/').pop(),
    sections: SIC_SECTION_LABELS,
    companies: companiesOut,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(artifact));

  const matchRate = ((result.matched / result.totalRegisterNames) * 100).toFixed(1);
  console.log('');
  console.log(`Done. Matched ${result.matched} / ${result.totalRegisterNames} sponsor names (${matchRate}%).`);
  console.log(`Dropped ${result.conflicted} names with conflicting SIC sections across duplicate canonical names.`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('[build-industry-map] Failed:', err);
  process.exit(1);
});
