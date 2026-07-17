import type { QuestionBank, QuestionBankRow } from '../data/admin';

export const QUESTION_BANK_COLUMNS = [
  'position',
  'prompt',
  'choice_a',
  'choice_b',
  'choice_c',
  'choice_d',
  'correct',
  'points',
] as const;

function parseCsvRecords(input: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n') {
      record.push(field.replace(/\r$/, ''));
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = '';
    } else field += character;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  record.push(field.replace(/\r$/, ''));
  if (record.some((value) => value.length > 0)) records.push(record);
  return records;
}

function validateRows(rows: QuestionBankRow[]): QuestionBank {
  if (rows.length !== 10) throw new Error('Question bank must contain exactly 10 questions.');
  rows.forEach((row, index) => {
    if (row.position !== index + 1) throw new Error('Question positions must be sequential from 1 to 10.');
    if (!row.prompt || !row.choice_a || !row.choice_b || !row.choice_c || !row.choice_d) {
      throw new Error(`Question ${row.position} has an empty required field.`);
    }
    if (!['a', 'b', 'c', 'd'].includes(row.correct)) throw new Error(`Question ${row.position} has an invalid correct choice.`);
    if (!Number.isInteger(row.points) || row.points < 1) throw new Error(`Question ${row.position} has invalid points.`);
  });
  return { pass_pct: 70, questions: rows };
}

export function parseQuestionBankCsv(input: string): QuestionBank {
  const records = parseCsvRecords(input.trim());
  if (records.length < 2) throw new Error('CSV must include a header and 10 questions.');
  const header = records[0].map((value) => value.trim().toLowerCase());
  const passPctIndex = header.indexOf('pass_pct');
  for (const column of QUESTION_BANK_COLUMNS) {
    if (!header.includes(column)) throw new Error(`CSV is missing ${column}.`);
  }
  const rows = records.slice(1).map((record) => {
    if (passPctIndex >= 0 && Number(record[passPctIndex]) !== 70) {
      throw new Error('pass_pct is published policy and must remain 70.');
    }
    const value = (column: typeof QUESTION_BANK_COLUMNS[number]) => record[header.indexOf(column)]?.trim() ?? '';
    return {
      position: Number(value('position')),
      prompt: value('prompt'),
      choice_a: value('choice_a'),
      choice_b: value('choice_b'),
      choice_c: value('choice_c'),
      choice_d: value('choice_d'),
      correct: value('correct').toLowerCase() as QuestionBankRow['correct'],
      points: Number(value('points')),
    };
  });
  return validateRows(rows);
}

export function parseQuestionBankJson(input: string): QuestionBank {
  const parsed = JSON.parse(input) as { pass_pct?: unknown; questions?: unknown } | unknown[];
  const passPct = Array.isArray(parsed) ? 70 : Number(parsed.pass_pct ?? 70);
  if (passPct !== 70) throw new Error('pass_pct is published policy and must remain 70.');
  const questions = (Array.isArray(parsed) ? parsed : parsed.questions) as QuestionBankRow[];
  if (!Array.isArray(questions)) throw new Error('JSON must contain a questions array.');
  return validateRows(questions.map((row) => ({
    ...row,
    position: Number(row.position),
    points: Number(row.points),
    correct: String(row.correct).toLowerCase() as QuestionBankRow['correct'],
  })));
}

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeQuestionBankCsv(bank: QuestionBank) {
  validateRows(bank.questions);
  const lines = [QUESTION_BANK_COLUMNS.join(',')];
  for (const row of bank.questions) {
    lines.push(QUESTION_BANK_COLUMNS.map((column) => escapeCsv(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}
