
import { describe, it, expect } from 'vitest';
import { validateEntryValue } from '../../src/utils/validation';

describe('validateEntryValue', () => {
  it('validates boolean', () => {
    expect(validateEntryValue('boolean', 'true')).toBeNull();
    expect(validateEntryValue('boolean', 'false')).toBeNull();
    expect(validateEntryValue('boolean', 'True')).not.toBeNull();
    expect(validateEntryValue('boolean', 'yes')).not.toBeNull();
  });

  it('validates integer', () => {
    expect(validateEntryValue('integer', '123')).toBeNull();
    expect(validateEntryValue('integer', '-456')).toBeNull();
    expect(validateEntryValue('integer', '123.45')).not.toBeNull();
    expect(validateEntryValue('integer', 'abc')).not.toBeNull();
  });

  it('validates float', () => {
    expect(validateEntryValue('float', '123')).toBeNull();
    expect(validateEntryValue('float', '123.45')).toBeNull();
    expect(validateEntryValue('float', '-0.01')).toBeNull();
    expect(validateEntryValue('float', 'abc')).not.toBeNull();
  });

  it('validates json', () => {
    expect(validateEntryValue('application/json', '{"a": 1}')).toBeNull();
    expect(validateEntryValue('application/json', '[1, 2]')).toBeNull();
    expect(validateEntryValue('application/json', 'true')).toBeNull(); // Valid JSON
    expect(validateEntryValue('application/json', '{invalid}')).not.toBeNull();
  });

  it('validates date', () => {
    expect(validateEntryValue('date', '2023-01-01')).toBeNull();
    expect(validateEntryValue('date', '2023-13-01')).not.toBeNull(); // Invalid date logic might not catch this with Date.parse, but regex catches format
    // Date.parse("2023-13-01") behaves differently in browsers vs node sometimes, but regex is strict
    expect(validateEntryValue('date', '01-01-2023')).not.toBeNull(); // Wrong format
  });
});
