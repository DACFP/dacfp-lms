import type {
  QuestionBank,
  QuestionBankRow,
  QuestionBankSelection,
} from '../data/admin';

export const QUESTION_BANK_FORMAT = 'dacfp-question-bank-v1' as const;

function normalizedRows(value: unknown): QuestionBankRow[] {
  if (!Array.isArray(value)) throw new Error('Question bank field "questions" must be an array.');
  if (value.length !== 10) {
    throw new Error(`Question bank field "questions" must contain exactly 10 questions; received ${value.length}.`);
  }
  return value.map((candidate, index) => {
    const questionPosition = index + 1;
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`Question ${questionPosition} must be an object.`);
    }
    const row = candidate as Partial<QuestionBankRow>;
    if (!Number.isInteger(row.position) || row.position !== questionPosition) {
      throw new Error(`Question ${questionPosition} field "position" must equal ${questionPosition}; received ${JSON.stringify(row.position)}.`);
    }
    if (typeof row.prompt !== 'string' || !row.prompt.trim()) {
      throw new Error(`Question ${questionPosition} field "prompt" must be a non-empty string.`);
    }
    if (!Array.isArray(row.choices)) {
      throw new Error(`Question ${questionPosition} field "choices" must be an array.`);
    }
    if (row.choices.length < 2 || row.choices.length > 12) {
      throw new Error(`Question ${questionPosition} field "choices" must contain between 2 and 12 items; received ${row.choices.length}.`);
    }
    const choices = row.choices.map((choice, choiceIndex) => {
      if (!choice || typeof choice !== 'object') {
        throw new Error(`Question ${questionPosition} field "choices[${choiceIndex}]" must be an object.`);
      }
      if (typeof choice.id !== 'string' || !choice.id.trim()) {
        throw new Error(`Question ${questionPosition} field "choices[${choiceIndex}].id" must be a non-empty string.`);
      }
      if (typeof choice.text !== 'string' || !choice.text.trim()) {
        throw new Error(`Question ${questionPosition} field "choices[${choiceIndex}].text" must be a non-empty string.`);
      }
      return { id: choice.id.trim(), text: choice.text.trim() };
    });
    const choiceIds = choices.map((choice) => choice.id);
    if (new Set(choiceIds).size !== choiceIds.length) {
      throw new Error(`Question ${questionPosition} field "choices" contains duplicate ids.`);
    }
    if (!Array.isArray(row.correct)) {
      throw new Error(`Question ${questionPosition} field "correct" must be an array.`);
    }
    if (row.correct.length === 0) {
      throw new Error(`Question ${questionPosition} field "correct" must contain at least one choice id.`);
    }
    const correct = row.correct.map((choiceId, correctIndex) => {
      if (typeof choiceId !== 'string' || !choiceId.trim()) {
        throw new Error(`Question ${questionPosition} field "correct[${correctIndex}]" must be a non-empty choice id.`);
      }
      return choiceId.trim();
    });
    if (new Set(correct).size !== correct.length) {
      throw new Error(`Question ${questionPosition} field "correct" contains duplicate choice ids.`);
    }
    const unknown = correct.find((id) => !choiceIds.includes(id));
    if (unknown) {
      throw new Error(`Question ${questionPosition} field "correct" contains unknown choice id "${unknown}".`);
    }
    return {
      position: questionPosition,
      prompt: row.prompt.trim(),
      choices,
      correct,
    };
  });
}

export function parseQuestionBankJson(
  input: string,
  moduleSelector: string,
): QuestionBankSelection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch (error) {
    throw new Error(`Question bank JSON is invalid: ${error instanceof Error ? error.message : 'syntax error'}.`);
  }
  if (Array.isArray(parsed)) {
    return {
      module_selector: moduleSelector,
      questions: normalizedRows(parsed),
    };
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Question bank JSON must be an array, a questions object, or a dacfp-question-bank-v1 file.');
  }
  if ('questions' in parsed) {
    return {
      module_selector: moduleSelector,
      questions: normalizedRows((parsed as { questions?: unknown }).questions),
    };
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
