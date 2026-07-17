/**
 * sicSections.ts
 * Rolls up granular 5-digit SIC 2007 codes (see sicCodes.ts) into the 21
 * official SIC 2007 "sections" (A-U) — the ONS/Companies House's own
 * industry taxonomy, not an invented one. Shared by scripts/build-industry-map.ts
 * (which builds the sponsor->industry artifact) and sponsorDirectory.ts
 * (which serves it), so both agree on exactly the same mapping.
 */

export type SicSectionId =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L'
  | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U';

export const SIC_SECTION_LABELS: Record<SicSectionId, string> = {
  A: 'Agriculture, Forestry & Fishing',
  B: 'Mining & Quarrying',
  C: 'Manufacturing',
  D: 'Energy & Utilities',
  E: 'Water & Waste Management',
  F: 'Construction',
  G: 'Wholesale & Retail',
  H: 'Transport & Storage',
  I: 'Accommodation & Food Services',
  J: 'Information & Communication',
  K: 'Finance & Insurance',
  L: 'Real Estate',
  M: 'Professional, Scientific & Technical',
  N: 'Admin & Support Services',
  O: 'Public Administration & Defence',
  P: 'Education',
  Q: 'Health & Social Work',
  R: 'Arts, Entertainment & Recreation',
  S: 'Other Services',
  T: 'Household Employers',
  U: 'Extraterritorial Organisations',
};

// [firstDivision, lastDivision, section] per the official SIC 2007 structure.
// Divisions not covered by any range (04, 34, 40, 44, 48, 54, 57, 67, 76, 83,
// 89) don't exist in SIC 2007 and fall through to null (Unknown).
const DIVISION_RANGES: [number, number, SicSectionId][] = [
  [1, 3, 'A'], [5, 9, 'B'], [10, 33, 'C'], [35, 35, 'D'], [36, 39, 'E'],
  [41, 43, 'F'], [45, 47, 'G'], [49, 53, 'H'], [55, 56, 'I'], [58, 63, 'J'],
  [64, 66, 'K'], [68, 68, 'L'], [69, 75, 'M'], [77, 82, 'N'], [84, 84, 'O'],
  [85, 85, 'P'], [86, 88, 'Q'], [90, 93, 'R'], [94, 96, 'S'], [97, 98, 'T'],
  [99, 99, 'U'],
];

// Companies House pseudo/administrative SIC codes that don't describe a real
// trading activity — division 99 would otherwise misfile them under
// "Extraterritorial Organisations" (U), which is wrong. Checked before the
// division-range lookup.
const NON_TRADING_CODES = new Set(['74990', '99999']);
// Residents' property management companies — administratively grouped under
// division 98 ("undifferentiated goods/services producing activities of
// households") in SIC 2007, but functionally real-estate management.
const PROPERTY_MANAGEMENT_CODE = '98000';

/**
 * Resolves a SIC section from a code or Companies House-style "code -
 * description" text (e.g. "62020 - Information technology consultancy
 * activities"). Returns null for codes with no real industry (dormant,
 * non-trading, "None Supplied", malformed) — callers should bucket these
 * as "Unknown", not drop them.
 */
export function sectionForSicCode(sicText: string | null | undefined): SicSectionId | null {
  if (!sicText) return null;
  const match = sicText.match(/^\s*(\d{5})\b/);
  if (!match) return null;
  const code = match[1];

  if (NON_TRADING_CODES.has(code)) return null;
  if (code === PROPERTY_MANAGEMENT_CODE) return 'L';

  const division = parseInt(code.slice(0, 2), 10);
  for (const [start, end, section] of DIVISION_RANGES) {
    if (division >= start && division <= end) return section;
  }
  return null;
}
