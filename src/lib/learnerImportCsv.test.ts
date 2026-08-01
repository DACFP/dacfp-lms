import { describe, expect, it } from 'vitest';
import { parseLearnerImportCsv } from './learnerImportCsv';

const HEADER = 'email,first,middle,last,cfp_board_id,course,expiration';

describe('parseLearnerImportCsv', () => {
  it('parses well-formed rows including quoted cells', () => {
    const rows = parseLearnerImportCsv(
      `${HEADER}\r\nimport-a@example.test,Ada,,Lovelace,123456,fpt-sandbox,2027-08-01\n` +
      `"import-b@example.test","Grace, Ms.","","Hopper","","renewal-2026-sandbox","2027-01-15"`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      email: 'import-a@example.test',
      first: 'Ada',
      middle: '',
      last: 'Lovelace',
      cfp_board_id: '123456',
      course: 'fpt-sandbox',
      expiration: '2027-08-01',
    });
    expect(rows[1].first).toBe('Grace, Ms.');
  });

  it('rejects a wrong header row', () => {
    expect(() => parseLearnerImportCsv('email,name\na@example.test,A')).toThrow(/header row/);
  });

  it('rejects an empty file and a header-only file', () => {
    expect(() => parseLearnerImportCsv('')).toThrow(/empty/);
    expect(() => parseLearnerImportCsv(HEADER)).toThrow(/no data rows/);
  });

  it('handles escaped quotes inside quoted cells', () => {
    const rows = parseLearnerImportCsv(
      `${HEADER}\n"q@example.test","An ""odd"" name",,Smith,,fpt-sandbox,2027-08-01`,
    );
    expect(rows[0].first).toBe('An "odd" name');
  });
});
