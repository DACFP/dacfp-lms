export type RoutedSurveyAnswer = number | string | string[];
export type RoutedSurveyAnswers = Record<string, RoutedSurveyAnswer>;
export type ChoiceFreeText = Record<string, Record<string, string>>;

export interface RoutedSurveySection {
  id: string;
  lesson_id: string;
  position: number;
  default_next_section_id: string | null;
}

export interface RoutedSurveyQuestion {
  id: string;
  lesson_id: string;
  section_id: string;
  position: number;
  kind: 'scale_1_5' | 'text' | 'single_choice' | 'multi_choice';
  choices: Array<{ id: string; text: string; allow_free_text?: boolean }> | null;
  required: boolean;
  routes: Record<string, string> | null;
}

export interface NormalizedRoutedSubmission {
  answers: RoutedSurveyAnswers;
  choice_free_text: ChoiceFreeText;
  path: string[];
}

export class SurveyFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SurveyFlowError';
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function selectedChoiceIds(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function canonicalRouteTarget(value: string | null) {
  if (!value || !/^[0-9a-f]{32}$/i.test(value)) return value;
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join('-');
}

export function nextSurveySectionId(
  section: RoutedSurveySection,
  questions: RoutedSurveyQuestion[],
  answers: Record<string, unknown>,
) {
  const gates = questions.filter(
    (question) =>
      question.section_id === section.id &&
      question.routes &&
      Object.keys(question.routes).length > 0,
  );
  if (gates.length > 1) {
    throw new SurveyFlowError('A survey section may contain only one routing gate.');
  }
  const gate = gates[0];
  if (!gate) return section.default_next_section_id;
  const selected = selectedChoiceIds(answers[gate.id])[0];
  return canonicalRouteTarget(
    (selected && gate.routes?.[selected]) || section.default_next_section_id,
  );
}

export function buildSurveyPath(
  sections: RoutedSurveySection[],
  questions: RoutedSurveyQuestion[],
  inputAnswers: unknown,
) {
  if (!sections.length) throw new SurveyFlowError('Survey sections are unavailable.');
  const ordered = [...sections].sort((left, right) => left.position - right.position);
  const sectionById = new Map(ordered.map((section) => [section.id, section]));
  const lessonId = ordered[0].lesson_id;
  if (ordered.some((section) => section.lesson_id !== lessonId)) {
    throw new SurveyFlowError('Survey sections must belong to one lesson.');
  }
  const answers = objectRecord(inputAnswers);
  const path: string[] = [];
  const visited = new Set<string>();
  let current: RoutedSurveySection | undefined = ordered[0];
  while (current) {
    if (visited.has(current.id)) throw new SurveyFlowError('Survey routing contains a cycle.');
    visited.add(current.id);
    path.push(current.id);
    const nextId = nextSurveySectionId(current, questions, answers);
    if (!nextId) break;
    const next = sectionById.get(nextId);
    if (!next) throw new SurveyFlowError('Survey routing points outside this lesson.');
    current = next;
  }
  return path;
}

function normalizeAnswer(question: RoutedSurveyQuestion, value: unknown) {
  if (question.kind === 'scale_1_5') {
    if (value === undefined && !question.required) return undefined;
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) {
      throw new SurveyFlowError('Complete every required survey question.');
    }
    return Number(value);
  }
  if (question.kind === 'text') {
    if ((value === undefined || value === '') && !question.required) return undefined;
    if (typeof value !== 'string' || !value.trim()) {
      throw new SurveyFlowError('Complete every required survey question.');
    }
    return value.trim();
  }

  const allowed = new Set((question.choices ?? []).map((choice) => choice.id));
  if (question.kind === 'single_choice') {
    if (value === undefined && !question.required) return undefined;
    if (typeof value !== 'string' || !allowed.has(value)) {
      throw new SurveyFlowError('Choose a valid survey response.');
    }
    return value;
  }

  if (value === undefined && !question.required) return undefined;
  if (
    !Array.isArray(value) ||
    (question.required && value.length === 0) ||
    value.some((choice) => typeof choice !== 'string' || !allowed.has(choice))
  ) {
    throw new SurveyFlowError('Choose a valid survey response.');
  }
  return [...new Set(value as string[])];
}

export function normalizeRoutedSubmission(
  sections: RoutedSurveySection[],
  questions: RoutedSurveyQuestion[],
  inputAnswers: unknown,
  inputChoiceFreeText: unknown,
): NormalizedRoutedSubmission {
  const suppliedAnswers = objectRecord(inputAnswers);
  const suppliedFreeText = objectRecord(inputChoiceFreeText);
  const path = buildSurveyPath(sections, questions, suppliedAnswers);
  const traversed = new Set(path);
  const answers: RoutedSurveyAnswers = {};
  const choiceFreeText: ChoiceFreeText = {};

  for (const question of questions) {
    if (!traversed.has(question.section_id)) continue;
    const answer = normalizeAnswer(question, suppliedAnswers[question.id]);
    if (answer === undefined) continue;
    answers[question.id] = answer;

    const selected = new Set(selectedChoiceIds(answer));
    const questionFreeText = objectRecord(suppliedFreeText[question.id]);
    for (const choice of question.choices ?? []) {
      if (!choice.allow_free_text || !selected.has(choice.id)) continue;
      const value = questionFreeText[choice.id];
      if (typeof value !== 'string' || !value.trim()) {
        throw new SurveyFlowError('Complete the selected option detail.');
      }
      choiceFreeText[question.id] ??= {};
      choiceFreeText[question.id][choice.id] = value.trim();
    }
  }

  return { answers, choice_free_text: choiceFreeText, path };
}
