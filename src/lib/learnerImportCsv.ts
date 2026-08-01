/**
 * M1 §7 bulk import: client-side CSV parsing only. All validation that can
 * reject a row happens server-side in lms-admin so the named rejections come
 * from one place; this parser only turns bytes into row objects and enforces
 * the header contract.
 */

export const LEARNER_IMPORT_HEADERS = [
  'email',
  'first',
  'middle',
  'last',
  'cfp_board_id',
  'course',
  'expiration',
] as const;

export interface LearnerImportRow {
  email: string;
  first: string;
  middle: string;
  last: string;
  cfp_board_id: string;
  course: string;
  expiration: string;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index += 1; }
        else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(cell); cell = ''; continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      rows.push(row); row = [];
      continue;
    }
    cell += char;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

export function parseLearnerImportCsv(text: string): LearnerImportRow[] {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('The CSV file is empty.');
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const expected = LEARNER_IMPORT_HEADERS.join(', ');
  if (
    header.length !== LEARNER_IMPORT_HEADERS.length ||
    LEARNER_IMPORT_HEADERS.some((name, index) => header[index] !== name)
  ) {
    throw new Error(`The header row must be exactly: ${expected}`);
  }
  if (rows.length === 1) throw new Error('The CSV has a header but no data rows.');
  return rows.slice(1).map((cells) => ({
    email: (cells[0] ?? '').trim(),
    first: (cells[1] ?? '').trim(),
    middle: (cells[2] ?? '').trim(),
    last: (cells[3] ?? '').trim(),
    cfp_board_id: (cells[4] ?? '').trim(),
    course: (cells[5] ?? '').trim(),
    expiration: (cells[6] ?? '').trim(),
  }));
}
