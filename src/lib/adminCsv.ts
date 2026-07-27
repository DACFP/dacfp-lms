import type {
  QuestionBank,
  QuestionBankRow,
  QuestionBankSelection,
} from '../data/admin';

export const QUESTION_BANK_FORMAT = 'dacfp-question-bank-v1' as const;

function validateRows(rows: QuestionBankRow[]) {
  if (rows.length !== 10) throw new Error('Question bank must contain exactly 10 questions.');
  rows.forEach((row, index) => {
    if (row.position !== index + 1) throw new Error('Question positions must be sequential from 1 to 10.');
    if (!row.prompt.trim()) {
      throw new Error(`Question ${row.position} prompt is required.`);
    }
    if (!Array.isArray(row.choices) || row.choices.length < 2 || row.choices.length > 12) {
      throw new Error(`Question ${row.position} choices must contain between 2 and 12 items.`);
    }
    const choiceIds = row.choices.map((choice) => choice?.id?.trim());
    if (row.choices.some((choice) =>
      !choice || typeof choice.id !== 'string' || !choice.id.trim()
      || typeof choice.text !== 'string' || !choice.text.trim()
    )) {
      throw new Error(`Question ${row.position} choices require non-empty id and text values.`);
    }
    if (new Set(choiceIds).size !== choiceIds.length) {
      throw new Error(`Question ${row.position} choice ids must be unique.`);
    }
    if (!Array.isArray(row.correct) || row.correct.length === 0) {
      throw new Error(`Question ${row.position} correct must contain at least one choice id.`);
    }
    if (new Set(row.correct).size !== row.correct.length) {
      throw new Error(`Question ${row.position} correct choice ids must be unique.`);
    }
    const unknown = row.correct.find((id) => !choiceIds.includes(id));
    if (unknown) {
      throw new Error(`Question ${row.position} correct contains unknown choice id "${unknown}".`);
    }
  });
  return rows;
}

function normalizedRows(value: unknown): QuestionBankRow[] {
  if (!Array.isArray(value)) throw new Error('Question bank must contain a questions array.');
  return validateRows(value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('Every question must be an object.');
    }
    const row = candidate as Partial<QuestionBankRow>;
    return {
      position: Number(row.position),
      prompt: typeof row.prompt === 'string' ? row.prompt : '',
      choices: Array.isArray(row.choices)
        ? row.choices.map((choice) => ({
            id: typeof choice?.id === 'string' ? choice.id : '',
            text: typeof choice?.text === 'string' ? choice.text : '',
          }))
        : [],
      correct: Array.isArray(row.correct)
        ? row.correct.map((id) => typeof id === 'string' ? id : '')
        : [],
    };
  }));
}

export function parseQuestionBankJson(
  input: string,
  moduleSelector: string,
): QuestionBankSelection {
  const parsed = JSON.parse(input) as unknown;
  if (Array.isArray(parsed)) {
    return {
      module_selector: moduleSelector,
      questions: normalizedRows(parsed),
    };
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Question bank JSON must be an array or a dacfp-question-bank-v1 file.');
  }
  const bank = parsed as Partial<QuestionBank>;
  if (bank.format !== QUESTION_BANK_FORMAT) {
    throw new Error(`Question bank format must be "${QUESTION_BANK_FORMAT}".`);
  }
  if (!bank.modules || typeof bank.modules !== 'object' || Array.isArray(bank.modules)) {
    throw new Error('Question bank modules must be an object.');
  }
  const selected = bank.modules[moduleSelector];
  if (!selected) {
    throw new Error(`Question bank does not contain module selector "${moduleSelector}".`);
  }
  return {
    module_selector: moduleSelector,
    questions: normalizedRows(selected.questions),
  };
}

export function serializeQuestionBankJson(bank: QuestionBank) {
  if (bank.format !== QUESTION_BANK_FORMAT) {
    throw new Error(`Question bank format must be "${QUESTION_BANK_FORMAT}".`);
  }
  const modules = Object.fromEntries(Object.entries(bank.modules).map(([selector, module]) => [
    selector,
    { questions: normalizedRows(module.questions) },
  ]));
  return `${JSON.stringify({ format: QUESTION_BANK_FORMAT, modules }, null, 2)}\n`;
}

export function moduleSelectorForPosition(position: number) {
  return `module_${String(position).padStart(2, '0')}`;
}
