import * as XLSX from 'xlsx';
import type { CfpCeExportRow } from '../data/admin';

export const CFP_CE_SHEET_NAME = 'Reporting Template';
export const CFP_CE_HEADERS = [
  'CFP Program ID',
  'Date Individual Completed',
  'Attendee CFP Board ID',
  'Attendee Last Name',
  'Attendee First Name',
  'Attendee Middle Name',
] as const;

const DATE_FORMAT = 'm/d/yy';
const TEMPLATE_URL = new URL('../../docs/cfp-ce-template.xlsx', import.meta.url);

function dateSerial(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('CFP completion date is invalid.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const parsed = new Date(utc);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('CFP completion date is invalid.');
  }
  return utc / 86_400_000 + 25_569;
}

function templateCell(
  sheet: XLSX.WorkSheet,
  row: number,
  column: number,
): XLSX.CellObject {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  const exemplarAddress = XLSX.utils.encode_cell({ r: 1, c: column });
  const existing = sheet[address] as XLSX.CellObject | undefined;
  const exemplar = sheet[exemplarAddress] as XLSX.CellObject | undefined;
  return {
    ...(exemplar?.s === undefined ? {} : { s: exemplar.s }),
    ...(exemplar?.z === undefined ? {} : { z: exemplar.z }),
    ...(existing?.s === undefined ? {} : { s: existing.s }),
    ...(existing?.z === undefined ? {} : { z: existing.z }),
    t: 'z',
  };
}

function validateTemplate(workbook: XLSX.WorkBook, sheet: XLSX.WorkSheet) {
  if (!workbook.SheetNames.includes(CFP_CE_SHEET_NAME)) {
    throw new Error('CFP template sheet name does not match the byte authority.');
  }
  // Read the stored values directly. B1 intentionally carries the template's
  // date number format; sheet_to_json applies that format to the header string
  // and returns a blank even though the workbook cell value is authoritative.
  const headers = CFP_CE_HEADERS.map((_, column) => {
    const address = XLSX.utils.encode_cell({ r: 0, c: column });
    return String(sheet[address]?.v ?? '');
  });
  if (
    headers.length !== CFP_CE_HEADERS.length ||
    CFP_CE_HEADERS.some((header, index) => headers[index] !== header)
  ) {
    throw new Error('CFP template headers do not match the byte authority.');
  }
}

export function buildCfpCeWorkbook(
  templateBytes: ArrayBuffer | Uint8Array,
  rows: CfpCeExportRow[],
) {
  const workbook = XLSX.read(templateBytes, {
    type: 'array',
    cellStyles: true,
    sheetStubs: true,
  });
  const sheet = workbook.Sheets[CFP_CE_SHEET_NAME];
  if (!sheet) throw new Error('CFP template sheet is unavailable.');
  validateTemplate(workbook, sheet);

  const templateRange = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:F1');
  const finalDataRow = Math.max(templateRange.e.r, rows.length);
  for (let row = 1; row <= finalDataRow; row += 1) {
    for (let column = 0; column < CFP_CE_HEADERS.length; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      sheet[address] = templateCell(sheet, row, column);
    }
  }

  rows.forEach((row, index) => {
    const worksheetRow = index + 1;
    const values = [
      row.cfp_program_id,
      dateSerial(row.date_individual_completed),
      row.attendee_cfp_board_id,
      row.attendee_last_name,
      row.attendee_first_name,
      row.attendee_middle_name,
    ];
    values.forEach((value, column) => {
      const address = XLSX.utils.encode_cell({ r: worksheetRow, c: column });
      const cell = templateCell(sheet, worksheetRow, column);
      sheet[address] = column === 1
        ? { ...cell, t: 'n', v: value as number, z: cell.z ?? DATE_FORMAT }
        : { ...cell, t: 's', v: String(value) };
    });
  });

  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: finalDataRow, c: CFP_CE_HEADERS.length - 1 },
  });
  return workbook;
}

export function writeCfpCeWorkbook(
  templateBytes: ArrayBuffer | Uint8Array,
  rows: CfpCeExportRow[],
) {
  const workbook = buildCfpCeWorkbook(templateBytes, rows);
  const output = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    cellStyles: true,
  }) as ArrayBuffer;
  return new Uint8Array(output);
}

export async function downloadCfpCeWorkbook(
  rows: CfpCeExportRow[],
  filename: string,
) {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error('CFP template could not be loaded.');
  const bytes = writeCfpCeWorkbook(await response.arrayBuffer(), rows);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
