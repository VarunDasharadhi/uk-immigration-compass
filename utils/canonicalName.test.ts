import { canonicalName } from './canonicalName.js';

describe('canonicalName', () => {
  it('lines up the same company across legal-suffix and punctuation variants', () => {
    expect(canonicalName('Tesco Stores Ltd.')).toBe(canonicalName('TESCO STORES LIMITED'));
  });

  it('lowercases, strips legal suffixes, and collapses whitespace', () => {
    expect(canonicalName('Acme Solutions Ltd')).toBe('acme');
  });

  it('replaces punctuation like &, apostrophes, and hyphens with spaces', () => {
    expect(canonicalName("M&S")).toBe('m s');
    expect(canonicalName("Sainsbury's")).toBe('sainsbury s');
  });

  it('memoizes: repeated calls with the same input return the same result', () => {
    const first = canonicalName('Deloitte LLP');
    const second = canonicalName('Deloitte LLP');
    expect(first).toBe(second);
    expect(first).toBe('deloitte');
  });

  it('returns different canonical forms for genuinely different names', () => {
    expect(canonicalName('Capgemini UK PLC')).not.toBe(canonicalName('Deloitte LLP'));
  });
});
