import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import type { CfpCeExportRow } from '../data/admin';
import {
  buildCfpCeWorkbook,
  CFP_CE_HEADERS,
  CFP_CE_SHEET_NAME,
  writeCfpCeWorkbook,
} from './cfpCeExport';

function testTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...CFP_CE_HEADERS],
    ...Array.from({ length: 265 }, () => Array(CFP_CE_HEADERS.length).fill(null)),
  ], { sheetStubs: true });
  sheet['!cols'] = [
    { width: 14.28515625 },
    { width: 14.28515625 },
    { width: 13.42578125 },
    { width: 15.42578125 },
    { width: 10.7109375 },
    { width: 13.140625 },
  ];
  for (let row = 2; row <= 266; row += 1) {
    sheet[`B${row}`] = { t: 'z', z: 'm/d/yy' };
  }
  sheet['!ref'] = 'A1:F266';
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, CFP_CE_SHEET_NAME);
  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    cellStyles: true,
  }) as ArrayBuffer;
}

const template = testTemplate();
const rows: CfpCeExportRow[] = [
  {
    completion_id: '10000000-0000-4000-8000-000000000001',
    course_id: '20000000-0000-4000-8000-000000000001',
    person_email: 'reportable@example.test',
    trigger: 'all_requirements_met',
    cfp_program_id: '312442',
    date_individual_completed: '2026-07-16',
    attendee_cfp_board_id: '123456',
    attendee_last_name: 'Rivera',
    attendee_first_name: 'Casey',
    attendee_middle_name: '',
  },
];

describe('CFP CE workbook export', () => {
  it('writes only the six authorized columns into the committed template shape', () => {
    const workbook = buildCfpCeWorkbook(template, rows);
    expect(workbook.SheetNames).toContain(CFP_CE_SHEET_NAME);
    const sheet = workbook.Sheets[CFP_CE_SHEET_NAME];
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1, range: 'A1:F1', defval: '' })).toEqual([
      [...CFP_CE_HEADERS],
    ]);
    expect([sheet.A2.v, sheet.B2.v, sheet.C2.v, sheet.D2.v, sheet.E2.v, sheet.F2.v]).toEqual([
      '312442',
      46219,
      '123456',
      'Rivera',
      'Casey',
      '',
    ]);
    expect(sheet.B2.t).toBe('n');
    expect(sheet.B2.z).toBe('m/d/yy');
    expect(XLSX.SSF.format(sheet.B2.z!, sheet.B2.v as number)).toBe('7/16/26');
    expect(sheet['!cols']?.slice(0, 6).map((column) => column.width)).toEqual([
      14.28515625,
      14.28515625,
      13.42578125,
      15.42578125,
      10.7109375,
      13.140625,
    ]);
  });

  it('round-trips an opening workbook with the authoritative sheet and header intact', () => {
    const bytes = writeCfpCeWorkbook(template, rows);
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: false, cellStyles: true });
    expect(workbook.SheetNames).toContain(CFP_CE_SHEET_NAME);
    const sheet = workbook.Sheets[CFP_CE_SHEET_NAME];
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1, range: 'A1:F1', defval: '' })).toEqual([
      [...CFP_CE_HEADERS],
    ]);
    expect([sheet.A2.v, sheet.B2.v, sheet.C2.v, sheet.D2.v, sheet.E2.v, sheet.F2.v]).toEqual([
      '312442',
      46219,
      '123456',
      'Rivera',
      'Casey',
      '',
    ]);
  });
});
