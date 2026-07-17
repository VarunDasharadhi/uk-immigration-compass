import { sectionForSicCode } from './sicSections.js';

describe('sectionForSicCode', () => {
  it('resolves a raw 5-digit code to its section', () => {
    expect(sectionForSicCode('62020')).toBe('J'); // Information & Communication
  });

  it('resolves a Companies House "code - description" string', () => {
    expect(sectionForSicCode('62020 - Information technology consultancy activities')).toBe('J');
  });

  it('resolves boundary divisions correctly', () => {
    expect(sectionForSicCode('01110')).toBe('A'); // division 01, start of range
    expect(sectionForSicCode('03110')).toBe('A'); // division 03, end of range
    expect(sectionForSicCode('33200')).toBe('C'); // division 33, end of Manufacturing
    expect(sectionForSicCode('35110')).toBe('D'); // division 35, single-division section
    expect(sectionForSicCode('47990')).toBe('G'); // division 47, end of Wholesale & Retail
    expect(sectionForSicCode('86900')).toBe('Q'); // division 86, start of Health & Social Work
    expect(sectionForSicCode('99000')).toBe('U'); // division 99 would be U if not a pseudo-code
  });

  it('returns null for divisions that do not exist in SIC 2007 (gaps between sections)', () => {
    expect(sectionForSicCode('04000')).toBeNull();
    expect(sectionForSicCode('34000')).toBeNull();
    expect(sectionForSicCode('40000')).toBeNull();
    expect(sectionForSicCode('89000')).toBeNull();
  });

  it('returns null for non-trading pseudo-codes instead of misfiling them under U', () => {
    expect(sectionForSicCode('74990')).toBeNull(); // Non-trading company
    expect(sectionForSicCode('99999')).toBeNull(); // Dormant company
  });

  it('maps the residents-property-management pseudo-code to Real Estate', () => {
    expect(sectionForSicCode('98000')).toBe('L');
  });

  it('returns null for "None Supplied", empty, or malformed input', () => {
    expect(sectionForSicCode('None Supplied')).toBeNull();
    expect(sectionForSicCode('')).toBeNull();
    expect(sectionForSicCode(null)).toBeNull();
    expect(sectionForSicCode(undefined)).toBeNull();
    expect(sectionForSicCode('1234')).toBeNull(); // 4-digit, not a real SIC 2007 code
  });
});
