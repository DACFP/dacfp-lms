import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Download,
  FileUp,
  GripVertical,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert } from '../components/Alert';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DetailList, type DetailItem } from '../components/DetailList';
import { Field } from '../components/Field';
import { PageHeader, StatusPill, formatDate } from '../components/common';
import { useAdmin } from '../context/AdminContext';
import type {
  AdminEnrollment,
  LearnerInspection,
  SurveyFlowSaveResult,
  SurveyResults,
} from '../data/admin';
import type {
  LmsCourse,
  LmsLesson,
  LmsModule,
  LmsSurveyQuestion,
  LmsSurveySection,
  SurveyQuestionKind,
} from '../data/types';
import {
  moduleSelectorForPosition,
  parseQuestionBankJson,
  serializeQuestionBankJson,
} from '../lib/adminCsv';
import { formatClock } from '../lib/time';

/**
 * Native <select> is retained rather than moving to the shadcn Select
 * primitive: these live inside uncontrolled <form> elements read via FormData
 * on submit, and Radix Select renders a button + portal with no form-associated
 * value. Swapping it would change submit behaviour, not restyle it. Styled to
 * match the foundation Input so the two read as one control family.
 */
const selectClass =
  'min-h-11 w-full rounded-lg border border-input bg-transparent px-3.5 py-2 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm';

function ErrorMessage({ message }: { message: string }) {
  return message ? <Alert tone="danger">{message}</Alert> : null;
}

function SuccessMessage({ message }: { message: string }) {
  return message ? <Alert tone="positive">{message}</Alert> : null;
}

async function handleMutation(promise: Promise<unknown>) {
  try {
    await promise;
  } catch {
    // AdminContext already surfaced the mutation failure in the shared banner.
  }
}

export function AdminCoursesPage() {
  const { catalog, mutate } = useAdmin();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError('');
    const values = new FormData(event.currentTarget);
    try {
      const course = await mutate<LmsCourse>('create_course', {
        title: values.get('title'),
        slug: values.get('slug'),
        description: values.get('description'),
        progression: 'sequential',
        ce_credits: null,
        requires_terms_acceptance: false,
        status: 'draft',
      });
      navigate(`/admin/course/${course.id}`);
    } catch {
      setError('Course could not be created. Check the slug and try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Content operations" title="Course catalog" description="Author and publish course structures without granting the operator direct table access." />
      {/* D6 acceptance path stays one screen: name, slug, description → Create
          draft → straight into the editor. No wizard, no extra step. */}
      <section className="card p-5 sm:p-6" aria-labelledby="create-course-heading">
        <h2 id="create-course-heading" className="text-xl font-bold text-dacfp-navy">Create a draft course</h2>
        <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={(event) => void create(event)}>
          <Field label="Course title"><Input name="title" required placeholder="Renewal 2027 Sandbox" /></Field>
          <Field label="Slug"><Input name="slug" required pattern="[a-z0-9-]+" placeholder="renewal-2027-sandbox" /></Field>
          <Field label="Description" className="lg:col-span-2"><Textarea className="min-h-24" name="description" required /></Field>
          <div className="lg:col-span-2"><ErrorMessage message={error} /></div>
          <div className="lg:col-span-2"><button className="button-primary" disabled={creating} type="submit"><Plus className="size-icon-sm" aria-hidden="true" />{creating ? 'Creating…' : 'Create draft'}</button></div>
        </form>
      </section>
      <section aria-labelledby="catalog-heading">
        <h2 id="catalog-heading" className="text-xl font-bold text-dacfp-navy">All courses</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalog.courses.map((course) => (
            <article key={course.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3"><p className="eyebrow">{course.slug}</p><StatusPill tone={course.status === 'published' ? 'positive' : course.status === 'archived' ? 'warning' : 'neutral'}>{course.status}</StatusPill></div>
              <h3 className="mt-3 text-xl font-bold text-dacfp-navy">{course.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-dacfp-gray-text">{course.description}</p>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-dacfp-gray-text">Progression</dt><dd className="font-bold text-dacfp-navy">{course.progression}</dd></div><div><dt className="text-dacfp-gray-text">CE credits</dt><dd className="font-bold text-dacfp-navy">{course.ce_credits ?? '—'}</dd></div></dl>
              <Link className="button-secondary mt-5" to={`/admin/course/${course.id}`}>Edit course</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function CourseSettings({ course }: { course: LmsCourse }) {
  const { catalog, mutate } = useAdmin();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setSaving(true); setMessage(''); setError('');
    try {
      await mutate('update_course', {
        id: course.id,
        title: values.get('title'),
        slug: values.get('slug'),
        description: values.get('description'),
        status: values.get('status'),
        progression: values.get('progression'),
        prerequisite_course_id: values.get('prerequisite_course_id'),
        ce_credits: values.get('ce_credits'),
        requires_terms_acceptance: values.get('requires_terms_acceptance') === 'on',
        pass_pct: 70,
      });
      setMessage('Course settings saved.');
    } catch { setError('Course settings could not be saved.'); }
    finally { setSaving(false); }
  };

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="course-settings-heading">
      <h2 id="course-settings-heading" className="text-xl font-bold text-dacfp-navy">Course settings</h2>
      <form key={`${course.id}-${course.title}-${course.status}`} className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={(event) => void save(event)}>
        <Field label="Title"><Input name="title" defaultValue={course.title} required /></Field>
        <Field label="Slug"><Input name="slug" defaultValue={course.slug} pattern="[a-z0-9-]+" required /></Field>
        <Field label="Description" className="md:col-span-2"><Textarea className="min-h-24" name="description" defaultValue={course.description} required /></Field>
        <Field label="Publication"><select className={selectClass} name="status" defaultValue={course.status}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>
        <Field label="Progression"><select className={selectClass} name="progression" defaultValue={course.progression}><option value="sequential">Sequential</option><option value="open">Open</option></select></Field>
        <Field label="Prerequisite"><select className={selectClass} name="prerequisite_course_id" defaultValue={course.prerequisite_course_id ?? ''}><option value="">None</option>{catalog.courses.filter((item) => item.id !== course.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        <Field label="CE credits"><Input name="ce_credits" defaultValue={course.ce_credits ?? ''} min="0" step="0.5" type="number" /></Field>
        <div className="rounded-lg border border-dacfp-gold/35 bg-dacfp-gold/10 p-4 md:col-span-2">
          {/* Hard Rule 12 display: read-only, with the published-policy note. */}
          <Field
            label="Exam pass policy"
            hint="70% is a published program requirement, not a configurable course setting. Imports with any other pass_pct are rejected."
          >
            <Input className="bg-dacfp-wash font-bold" readOnly value="70%" aria-readonly="true" />
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-dacfp-line p-3 md:col-span-2"><input defaultChecked={course.requires_terms_acceptance} name="requires_terms_acceptance" type="checkbox" className="size-5 accent-dacfp-maroon" /><span className="font-bold text-dacfp-navy">Require first-entry terms acceptance</span></label>
        <div className="space-y-3 md:col-span-2"><ErrorMessage message={error} /><SuccessMessage message={message} /></div>
        <div className="md:col-span-2"><button className="button-primary" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save course settings'}</button></div>
      </form>
    </section>
  );
}

function orderMove<T extends { id: string }>(items: T[], id: string, direction: -1 | 1) {
  const index = items.findIndex((item) => item.id === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= items.length) return items;
  const next = [...items];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

/**
 * Up/down reorder controls — the touch and keyboard fallback (brief #21). Real
 * buttons with names, so this path works with no pointer at all. Retained and
 * visible alongside the drag handle, never replaced by it.
 */
function ReorderControls({
  label,
  atStart,
  atEnd,
  onUp,
  onDown,
}: {
  label: string;
  atStart: boolean;
  atEnd: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <button className="button-quiet px-3" disabled={atStart} aria-label={`Move ${label} up`} type="button" onClick={onUp}>
        <ArrowUp className="size-icon-sm" aria-hidden="true" />
      </button>
      <button className="button-quiet px-3" disabled={atEnd} aria-label={`Move ${label} down`} type="button" onClick={onDown}>
        <ArrowDown className="size-icon-sm" aria-hidden="true" />
      </button>
    </div>
  );
}

function QuestionBankPanel({ module }: { module: LmsModule }) {
  const { mutate, exportQuestionBank } = useAdmin();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const moduleSelector = moduleSelectorForPosition(module.position);

  const importBank = async () => {
    setError(''); setMessage('');
    try {
      const bank = parseQuestionBankJson(input, moduleSelector);
      await mutate('import_question_bank', {
        module_id: module.id,
        module_selector: bank.module_selector,
        questions: bank.questions,
      });
      setMessage('10-question bank imported at the fixed 70% policy.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Question bank import failed.'); }
  };

  const exportBank = async () => {
    setError('');
    try {
      const bank = await exportQuestionBank(module.id);
      const json = serializeQuestionBankJson(bank);
      setInput(json);
      downloadText(
        `${module.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-questions.json`,
        json,
        'application/json',
      );
      setMessage('Question bank exported in canonical round-trip JSON format.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Question bank export failed.'); }
  };

  return (
    <div className="mt-5 rounded-lg border border-dacfp-line bg-dacfp-wash p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-bold text-dacfp-navy">Question bank</h4><p className="text-sm text-dacfp-gray-text">Exactly 10 questions · 2–12 choices each · multi-answer supported · module selector <code>{moduleSelector}</code></p></div><button className="button-secondary" type="button" onClick={() => void exportBank()}><Download className="size-icon-sm" aria-hidden="true" />Export JSON</button></div>
      <Field label="Paste or load question bank" className="mt-4"><Textarea className="min-h-40 font-mono text-sm" value={input} onChange={(event) => setInput(event.target.value)} /></Field>
      <Field label="Or load a bank file" className="mt-3">
        <Input accept=".json,application/json" className="py-2" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(setInput).catch(() => setError('Question bank file could not be read.')); }} />
      </Field>
      <div className="mt-4 space-y-3"><ErrorMessage message={error} /><SuccessMessage message={message} /><button className="button-primary" type="button" onClick={() => void importBank()}><FileUp className="size-icon-sm" aria-hidden="true" />Import and replace</button></div>
    </div>
  );
}

type SurveyChoiceDraft = {
  id: string;
  text: string;
  allowFreeText: boolean;
  routeSectionId: string;
};

type SurveyQuestionDraft = {
  clientId: string;
  prompt: string;
  kind: SurveyQuestionKind;
  choices: SurveyChoiceDraft[];
  required: boolean;
};

type SurveySectionDraft = {
  clientId: string;
  title: string;
  defaultNextSectionId: string;
  questions: SurveyQuestionDraft[];
};

function newChoice(text = ''): SurveyChoiceDraft {
  return {
    id: `choice-${crypto.randomUUID().slice(0, 8)}`,
    text,
    allowFreeText: false,
    routeSectionId: '',
  };
}

function questionDraft(question?: LmsSurveyQuestion): SurveyQuestionDraft {
  return {
    clientId: question?.id ?? crypto.randomUUID(),
    prompt: question?.prompt ?? '',
    kind: question?.kind ?? 'text',
    choices: question?.choices?.map((choice) => ({
      id: choice.id,
      text: choice.text,
      allowFreeText: choice.allow_free_text === true,
      routeSectionId: question.routes?.[choice.id] ?? '',
    })) ?? [],
    required: question?.required ?? true,
  };
}

function sectionDraft(
  section?: LmsSurveySection,
  questions: LmsSurveyQuestion[] = [],
): SurveySectionDraft {
  return {
    clientId: section?.id ?? crypto.randomUUID(),
    title: section?.title ?? '',
    defaultNextSectionId: section?.default_next_section_id ?? '',
    questions: questions.map((question) => questionDraft(question)),
  };
}

function moveDraft<T extends { clientId: string }>(
  items: T[],
  clientId: string,
  direction: -1 | 1,
) {
  const index = items.findIndex((item) => item.clientId === clientId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= items.length) return items;
  const next = [...items];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

function downloadText(fileName: string, content: string, type = 'text/csv') {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([content], { type }));
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
}

function SurveyResultsPanel({ lessonId }: { lessonId: string }) {
  const { surveyResults, exportSurveyResponses } = useAdmin();
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setResults(await surveyResults(lessonId));
    } catch {
      setError('Survey results could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const exportRows = async () => {
    setError('');
    try {
      const exported = await exportSurveyResponses({ lesson_id: lessonId });
      downloadText(exported.file_name, exported.csv);
    } catch {
      setError('Survey responses could not be exported.');
    }
  };

  return (
    <section className="mt-5 rounded-lg border border-dacfp-line bg-dacfp-wash p-4" aria-label="Survey results">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="font-bold text-dacfp-navy">Survey results</h4>
          <p className="text-sm text-dacfp-gray-text">Operator-gated and audited on every view or export.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="button-secondary" disabled={loading} onClick={() => void load()} type="button">
            <BarChart3 className="size-icon-sm" aria-hidden="true" />
            {loading ? 'Loading…' : 'View results'}
          </button>
          <button className="button-secondary" onClick={() => void exportRows()} type="button">
            <Download className="size-icon-sm" aria-hidden="true" />Export CSV
          </button>
        </div>
      </div>
      <div className="mt-3"><ErrorMessage message={error} /></div>
      {results ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-white p-4"><p className="text-xs font-bold uppercase text-dacfp-gray-text">Responses</p><p className="mt-1 text-2xl font-bold tabular-nums text-dacfp-navy">{results.response_count}</p></div>
            <div className="rounded-lg bg-white p-4"><p className="text-xs font-bold uppercase text-dacfp-gray-text">Enrolled</p><p className="mt-1 text-2xl font-bold tabular-nums text-dacfp-navy">{results.enrolled_count}</p></div>
            <div className="rounded-lg bg-white p-4"><p className="text-xs font-bold uppercase text-dacfp-gray-text">Completion</p><p className="mt-1 text-2xl font-bold tabular-nums text-dacfp-navy">{results.completion_rate}%</p></div>
          </div>
          <div className="rounded-lg border border-dacfp-line bg-white p-4">
            <h5 className="font-bold text-dacfp-navy">Path distribution</h5>
            {results.path_distribution.length ? (
              <ul className="mt-3 space-y-2 text-sm text-dacfp-gray-text">
                {results.path_distribution.map((route) => (
                  <li className="flex justify-between gap-4" key={route.path.join('>')}>
                    <span>{route.path.map((sectionId) => {
                      const section = results.sections.find((item) => item.id === sectionId);
                      return section ? `§${section.position}` : sectionId;
                    }).join(' → ')}</span>
                    <strong className="tabular-nums text-dacfp-navy">{route.count}</strong>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-dacfp-gray-text">No submitted paths.</p>}
          </div>
          <ol className="space-y-3">
            {results.questions.map(({ question, denominator, breakdown }) => (
              <li className="rounded-lg border border-dacfp-line bg-white p-4" key={question.id}>
                <p className="font-bold text-dacfp-navy">{question.position}. {question.prompt}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-dacfp-gray-text">Shown to {denominator} respondent{denominator === 1 ? '' : 's'}</p>
                {breakdown.kind === 'scale_1_5' ? (
                  <div className="mt-3 text-sm text-dacfp-gray-text">
                    <p>Average: <strong className="text-dacfp-navy">{breakdown.average ?? '—'}</strong></p>
                    <p className="mt-1 tabular-nums">1: {breakdown.counts['1']} · 2: {breakdown.counts['2']} · 3: {breakdown.counts['3']} · 4: {breakdown.counts['4']} · 5: {breakdown.counts['5']}</p>
                  </div>
                ) : breakdown.kind === 'text' ? (
                  breakdown.responses.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-dacfp-gray-text">
                      {breakdown.responses.map((response, index) => <li className="rounded bg-dacfp-wash p-3" key={`${question.id}-${index}`}>{response}</li>)}
                    </ul>
                  ) : <p className="mt-3 text-sm text-dacfp-gray-text">No text responses.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm text-dacfp-gray-text">
                    {breakdown.counts.map((choice) => <li key={choice.id}><div className="flex justify-between gap-3"><span>{choice.text}</span><strong className="tabular-nums text-dacfp-navy">{choice.count}</strong></div>{choice.free_text.length ? <ul className="mt-1 space-y-1 border-l-2 border-dacfp-line pl-3">{choice.free_text.map((text, index) => <li key={`${choice.id}-${index}`}>{text}</li>)}</ul> : null}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function SurveyQuestionEditor({ lesson }: { lesson: LmsLesson }) {
  const { catalog, mutate } = useAdmin();
  const [sections, setSections] = useState<SurveySectionDraft[]>(() => {
    const existingSections = catalog.surveySections
      .filter((section) => section.lesson_id === lesson.id)
      .sort((left, right) => left.position - right.position);
    if (!existingSections.length) return [sectionDraft()];
    return existingSections.map((section) => sectionDraft(
      section,
      catalog.surveyQuestions
        .filter((question) => question.section_id === section.id)
        .sort((left, right) => left.position - right.position),
    ));
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [outline, setOutline] = useState('');
  const [editing, setEditing] = useState(false);
  const [orphanConfirmationCount, setOrphanConfirmationCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const updateSection = (
    sectionId: string,
    update: (section: SurveySectionDraft) => SurveySectionDraft,
  ) => setSections((current) => current.map((section) =>
    section.clientId === sectionId ? update(section) : section
  ));

  const save = async (confirmOrphan = false) => {
    if (saving) return;
    setSaving(true);
    setMessage('');
    setError('');
    if (!confirmOrphan) setOrphanConfirmationCount(null);
    try {
      const payload = sections.map((section, sectionIndex) => ({
        id: section.clientId,
        position: sectionIndex + 1,
        title: section.title,
        default_next_section_id: section.defaultNextSectionId || null,
        questions: section.questions.map((question, questionIndex) => {
          if (!question.prompt.trim()) throw new Error('Every survey question needs a prompt.');
          const choiceQuestion = question.kind === 'single_choice' || question.kind === 'multi_choice';
          if (choiceQuestion && (
            question.choices.length < 2 || question.choices.some((choice) => !choice.text.trim())
          )) {
            throw new Error('Choice questions require at least two named choices.');
          }
          const routes = question.kind === 'single_choice'
            ? Object.fromEntries(question.choices
              .filter((choice) => choice.routeSectionId)
              .map((choice) => [choice.id, choice.routeSectionId]))
            : {};
          return {
            id: question.clientId,
            position: questionIndex + 1,
            prompt: question.prompt,
            kind: question.kind,
            choices: choiceQuestion
              ? question.choices.map((choice) => ({
                  id: choice.id,
                  text: choice.text,
                  ...(choice.allowFreeText ? { allow_free_text: true } : {}),
                }))
              : null,
            required: question.required,
            routes: Object.keys(routes).length ? routes : null,
          };
        }),
      }));
      const result = await mutate<SurveyFlowSaveResult>('replace_survey_flow', {
        lesson_id: lesson.id,
        sections: payload,
        confirm_orphan: confirmOrphan,
      });
      setOutline(result.outline);
      setOrphanConfirmationCount(null);
      setMessage('Survey flow saved, validated, and audited.');
    } catch (failure) {
      const failureMessage = failure instanceof Error
        ? failure.message
        : 'Survey questions could not be saved.';
      const orphanMatch = /SURVEY_ORPHAN_CONFIRMATION_REQUIRED:\s*(\d+)\s+affected response/.exec(
        failureMessage,
      );
      if (!confirmOrphan && orphanMatch) {
        setOrphanConfirmationCount(Number(orphanMatch[1]));
        return;
      }
      setError(failureMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-5 rounded-lg border border-dacfp-blue/30 bg-dacfp-wash-blue p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h4 className="font-bold text-dacfp-navy">Survey routed sections</h4><p className="text-sm text-dacfp-gray-text">Edit section order, defaults, gate routes, and required questions.</p></div>
        {editing
          ? <button className="button-secondary" onClick={() => setSections((current) => [...current, sectionDraft()])} type="button"><Plus className="size-icon-sm" aria-hidden="true" />Add section</button>
          : <button className="button-secondary" onClick={() => setEditing(true)} type="button">Edit survey flow</button>}
      </div>
      {editing ? <><div className="mt-4 space-y-4">
        {sections.map((section, sectionIndex) => (
          <article className="rounded-lg border border-dacfp-line bg-white p-4" key={section.clientId}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid flex-1 gap-3 md:grid-cols-2">
                <Field label={`Section ${sectionIndex + 1} internal title`}><Input value={section.title} onChange={(event) => updateSection(section.clientId, (current) => ({ ...current, title: event.target.value }))} /></Field>
                <Field label="Default next section" hint="Used when no choice route overrides it"><select className={selectClass} value={section.defaultNextSectionId} onChange={(event) => updateSection(section.clientId, (current) => ({ ...current, defaultNextSectionId: event.target.value }))}><option value="">Submit / end</option>{sections.filter((item) => item.clientId !== section.clientId).map((item, index) => <option key={item.clientId} value={item.clientId}>§{sections.indexOf(item) + 1} {item.title || `Section ${index + 1}`}</option>)}</select></Field>
              </div>
              <div className="flex gap-1">
                <ReorderControls label={section.title || `section ${sectionIndex + 1}`} atStart={sectionIndex === 0} atEnd={sectionIndex === sections.length - 1} onUp={() => setSections((current) => moveDraft(current, section.clientId, -1))} onDown={() => setSections((current) => moveDraft(current, section.clientId, 1))} />
                <button className="button-quiet px-3 text-status-danger" disabled={sections.length === 1} aria-label={`Delete survey section ${sectionIndex + 1}`} onClick={() => setSections((current) => current.filter((item) => item.clientId !== section.clientId))} type="button"><Trash2 className="size-icon-sm" aria-hidden="true" /></button>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {section.questions.map((question, questionIndex) => (
                <section className="rounded-lg border border-dacfp-line bg-dacfp-wash p-4" key={question.clientId}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field className="md:col-span-2" label={`Question ${questionIndex + 1}`}><Input required value={question.prompt} onChange={(event) => updateSection(section.clientId, (current) => ({ ...current, questions: current.questions.map((item) => item.clientId === question.clientId ? { ...item, prompt: event.target.value } : item) }))} /></Field>
                    <Field label="Response kind"><select className={selectClass} value={question.kind} onChange={(event) => updateSection(section.clientId, (current) => ({ ...current, questions: current.questions.map((item) => item.clientId === question.clientId ? { ...item, kind: event.target.value as SurveyQuestionKind, choices: ['single_choice', 'multi_choice'].includes(event.target.value) && item.choices.length < 2 ? [newChoice(), newChoice()] : item.choices } : item) }))}><option value="scale_1_5">1–5 scale</option><option value="text">Text</option><option value="single_choice">Single choice / gate</option><option value="multi_choice">Multiple choice</option></select></Field>
                    <label className="flex min-h-11 items-center gap-2 self-end"><input className="size-5 accent-dacfp-maroon" checked={question.required} onChange={(event) => updateSection(section.clientId, (current) => ({ ...current, questions: current.questions.map((item) => item.clientId === question.clientId ? { ...item, required: event.target.checked } : item) }))} type="checkbox" /><span className="font-bold">Required on this path</span></label>
                  </div>
                  {['single_choice', 'multi_choice'].includes(question.kind) ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-bold text-dacfp-navy">Choices {question.kind === 'single_choice' ? 'and optional routes' : ''}</p>
                      {question.choices.map((choice, choiceIndex) => (
                        <div className="grid gap-2 rounded border border-dacfp-line bg-white p-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-end" key={choice.id}>
                          <Field label={`Choice ${choiceIndex + 1}`}><Input value={choice.text} onChange={(event) => updateSection(section.clientId, (current) => ({ ...current, questions: current.questions.map((item) => item.clientId === question.clientId ? { ...item, choices: item.choices.map((candidate) => candidate.id === choice.id ? { ...candidate, text: event.target.value } : candidate) } : item) }))} /></Field>
                          <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input checked={choice.allowFreeText} className="size-5 accent-dacfp-maroon" onChange={(event) => updateSection(section.clientId, (current) => ({ ...current, questions: current.questions.map((item) => item.clientId === question.clientId ? { ...item, choices: item.choices.map((candidate) => candidate.id === choice.id ? { ...candidate, allowFreeText: event.target.checked } : candidate) } : item) }))} type="checkbox" />Free text</label>
                          {question.kind === 'single_choice' ? <Field label="Route override"><select className={selectClass} value={choice.routeSectionId} onChange={(event) => updateSection(section.clientId, (current) => ({ ...current, questions: current.questions.map((item) => item.clientId === question.clientId ? { ...item, choices: item.choices.map((candidate) => candidate.id === choice.id ? { ...candidate, routeSectionId: event.target.value } : candidate) } : item) }))}><option value="">Use section default</option>{sections.filter((item) => item.clientId !== section.clientId).map((item) => <option key={item.clientId} value={item.clientId}>§{sections.indexOf(item) + 1} {item.title}</option>)}</select></Field> : <span />}
                          <button className="button-quiet px-3 text-status-danger" disabled={question.choices.length <= 2} aria-label={`Delete choice ${choiceIndex + 1}`} onClick={() => updateSection(section.clientId, (current) => ({ ...current, questions: current.questions.map((item) => item.clientId === question.clientId ? { ...item, choices: item.choices.filter((candidate) => candidate.id !== choice.id) } : item) }))} type="button"><Trash2 className="size-icon-sm" aria-hidden="true" /></button>
                        </div>
                      ))}
                      <button className="button-quiet" onClick={() => updateSection(section.clientId, (current) => ({ ...current, questions: current.questions.map((item) => item.clientId === question.clientId ? { ...item, choices: [...item.choices, newChoice()] } : item) }))} type="button"><Plus className="size-icon-sm" aria-hidden="true" />Add choice</button>
                    </div>
                  ) : null}
                  <div className="mt-3 flex justify-end gap-1">
                    <ReorderControls label={question.prompt || `question ${questionIndex + 1}`} atStart={questionIndex === 0} atEnd={questionIndex === section.questions.length - 1} onUp={() => updateSection(section.clientId, (current) => ({ ...current, questions: moveDraft(current.questions, question.clientId, -1) }))} onDown={() => updateSection(section.clientId, (current) => ({ ...current, questions: moveDraft(current.questions, question.clientId, 1) }))} />
                    <button className="button-quiet px-3 text-status-danger" aria-label={`Delete survey question ${questionIndex + 1}`} onClick={() => updateSection(section.clientId, (current) => ({ ...current, questions: current.questions.filter((item) => item.clientId !== question.clientId) }))} type="button"><Trash2 className="size-icon-sm" aria-hidden="true" /></button>
                  </div>
                </section>
              ))}
              <button className="button-secondary" onClick={() => updateSection(section.clientId, (current) => ({ ...current, questions: [...current.questions, questionDraft()] }))} type="button"><Plus className="size-icon-sm" aria-hidden="true" />Add question to section</button>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <ErrorMessage message={error} />
        <SuccessMessage message={message} />
        {outline ? <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-dacfp-line bg-white p-4 text-sm text-dacfp-navy" aria-label="Survey flow outline">{outline}</pre> : null}
        <div className="flex flex-wrap gap-3">
          <button className="button-primary" disabled={saving} onClick={() => void save()} type="button">
            {saving ? 'Saving survey flow…' : 'Save survey flow'}
          </button>
          {orphanConfirmationCount !== null ? (
            <ConfirmDialog
              trigger={<button className="button-secondary text-status-danger" type="button">Review destructive survey edit</button>}
              title="Delete sections used by submitted responses?"
              description={`${orphanConfirmationCount} existing response${orphanConfirmationCount === 1 ? '' : 's'} reference a section being deleted. Confirming will preserve each response record but its historical path will no longer resolve to that section.`}
              confirmLabel={`Delete and orphan ${orphanConfirmationCount} response${orphanConfirmationCount === 1 ? '' : 's'}`}
              onConfirm={() => save(true)}
            />
          ) : null}
        </div>
      </div></> : null}
      <SurveyResultsPanel lessonId={lesson.id} />
    </div>
  );
}

function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function LessonEditor({ lesson }: { lesson: LmsLesson }) {
  const { catalog, mutate } = useAdmin();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<LmsLesson['kind']>(lesson.kind);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); setMessage('');
    const values = new FormData(event.currentTarget);
    try {
      await mutate('update_lesson', { id: lesson.id, title: values.get('title'), kind: values.get('kind'), video_ref: values.get('video_ref'), duration_seconds: values.get('duration_seconds'), body_md: values.get('body_md'), is_required: values.get('is_required') === 'on' });
      setMessage('Lesson saved.');
    } catch { setError('Lesson could not be saved.'); }
    finally { setSaving(false); }
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setMessage('');
    const form = event.currentTarget;
    const values = new FormData(form);
    const selected = values.get('file');
    const textContent = String(values.get('text_content') ?? '').trim();
    const file = selected instanceof File && selected.size
      ? selected
      : textContent
        ? new File([textContent], 'sandbox-resource.txt', { type: 'text/plain' })
        : null;
    if (!file) return setError('Choose a resource file or enter text content.');
    try {
      await mutate('upload_resource', { lesson_id: lesson.id, title: values.get('resource_title'), file_name: file.name, mime_type: file.type || 'text/plain', base64: bytesToBase64(await file.arrayBuffer()) });
      setMessage('Private lesson resource uploaded.');
      form.reset();
    } catch { setError('Resource upload failed. Check its type and 5 MB size limit.'); }
  };

  return (
    <article className="rounded-lg border border-dacfp-line bg-white p-4">
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void save(event)}>
        <Field label="Lesson title"><Input name="title" defaultValue={lesson.title} required /></Field>
        <Field label="Kind"><select className={selectClass} name="kind" value={kind} onChange={(event) => setKind(event.target.value as LmsLesson['kind'])}><option value="video">Video</option><option value="reading">Reading</option><option value="survey">Survey</option></select></Field>
        {kind === 'video' ? <>
          <Field label="video_ref path"><Input name="video_ref" defaultValue={lesson.video_ref ?? ''} placeholder="placeholder/dacfp-d3-placeholder.mp4" /></Field>
          <Field label="Duration seconds"><Input name="duration_seconds" type="number" min="1" defaultValue={lesson.duration_seconds ?? ''} /></Field>
        </> : null}
        {kind === 'reading' ? <Field label="Reading body" className="md:col-span-2"><Textarea name="body_md" defaultValue={lesson.body_md ?? ''} /></Field> : null}
        <label className="flex min-h-11 items-center gap-2"><input className="size-5 accent-dacfp-maroon" type="checkbox" name="is_required" defaultChecked={lesson.is_required} /><span className="font-bold">Required</span></label>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <button className="button-secondary" disabled={saving} type="submit">
            {saving ? 'Saving lesson…' : 'Save lesson'}
          </button>
          <ConfirmDialog
            trigger={
              <button className="button-quiet text-status-danger" type="button">
                <Trash2 className="size-icon-sm" aria-hidden="true" />Delete
              </button>
            }
            title="Delete this lesson?"
            description={`"${lesson.title}" and any resources attached to it will be permanently removed. This cannot be undone.`}
            confirmLabel="Delete lesson"
            onConfirm={() => handleMutation(mutate('delete_lesson', { id: lesson.id }))}
          />
        </div>
      </form>
      <form className="mt-4 grid gap-3 border-t border-dacfp-line pt-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => void upload(event)}>
        <Field label="Resource title" className="sm:col-span-1"><Input name="resource_title" required placeholder="Operator guide" /></Field>
        <Field label="Resource file" className="sm:col-span-1"><Input className="py-2" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv" /></Field>
        <div className="flex items-end"><button className="button-secondary w-full sm:w-auto" type="submit"><FileUp className="size-icon-sm" aria-hidden="true" />Upload</button></div>
        <Field label="Or create a text resource" className="sm:col-span-3"><Textarea className="min-h-24" name="text_content" placeholder="Paste sandbox text content when no file is selected." /></Field>
      </form>
      <div className="mt-3 space-y-2"><ErrorMessage message={error} /><SuccessMessage message={message} /></div>
      {lesson.kind === 'survey' ? (
        <SurveyQuestionEditor
          key={`${lesson.id}:${catalog.surveyQuestions
            .filter((question) => question.lesson_id === lesson.id)
            .map((question) => question.id)
            .join(',')}`}
          lesson={lesson}
        />
      ) : null}
    </article>
  );
}

function ModuleEditor({ module, modules }: { module: LmsModule; modules: LmsModule[] }) {
  const { catalog, mutate } = useAdmin();
  const lessons = catalog.lessons.filter((lesson) => lesson.module_id === module.id).sort((a, b) => a.position - b.position);
  const [lessonTitle, setLessonTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [addingLesson, setAddingLesson] = useState(false);

  const reorderModules = (next: LmsModule[]) =>
    mutate('reorder', { kind: 'modules', parent_id: module.course_id, ordered_ids: next.map((item) => item.id) });
  const reorderLessons = (next: LmsLesson[]) =>
    mutate('reorder', { kind: 'lessons', parent_id: module.id, ordered_ids: next.map((item) => item.id) });

  const dropModuleBefore = async (draggedId: string) => {
    if (!draggedId || draggedId === module.id) return;
    const source = modules.findIndex((item) => item.id === draggedId);
    const target = modules.findIndex((item) => item.id === module.id);
    if (source < 0 || target < 0) return;
    const next = [...modules];
    const [moved] = next.splice(source, 1);
    next.splice(target, 0, moved);
    await handleMutation(reorderModules(next));
  };

  const addLesson = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (addingLesson) return;
    setAddingLesson(true);
    try {
      await mutate('create_lesson', {
        module_id: module.id,
        title: lessonTitle,
        kind: 'video',
        is_required: true,
        duration_seconds: 4,
      });
      setLessonTitle('');
    } catch {
      // AdminContext owns the mutation failure banner.
    } finally {
      setAddingLesson(false);
    }
  };

  return (
    <article
      className={`card p-5 transition-shadow sm:p-6 ${dragging ? 'ring-2 ring-dacfp-blue' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { void dropModuleBefore(event.dataTransfer.getData('text/plain')); }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* brief #21: drag is confined to this explicit handle, not the whole
            card. Only the grip is draggable, so selecting text or tapping a
            field never starts a drag. The up/down controls remain the pointer-
            free path. */}
        <button
          type="button"
          aria-label={`Drag to reorder ${module.title}`}
          title="Drag to reorder"
          draggable
          onDragStart={(event) => { event.dataTransfer.setData('text/plain', module.id); event.dataTransfer.effectAllowed = 'move'; setDragging(true); }}
          onDragEnd={() => setDragging(false)}
          className="hidden size-9 shrink-0 cursor-grab touch-none place-items-center rounded-md text-dacfp-gray-text hover:bg-dacfp-wash-blue hover:text-dacfp-navy active:cursor-grabbing sm:grid"
        >
          <GripVertical className="size-icon-md" aria-hidden="true" />
        </button>
        <form className="flex flex-1 flex-col gap-3" onSubmit={async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); await handleMutation(mutate('update_module', { id: module.id, title: values.get('title'), bridge_copy: values.get('bridge_copy') })); }}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input name="title" defaultValue={module.title} aria-label={`Module ${module.position} title`} />
            <button className="button-secondary shrink-0" type="submit">Save module</button>
          </div>
          <Field
            label="Transition bridge copy"
            hint="One sentence explaining why this module matters. It appears after the preceding quiz pass."
          >
            <Textarea
              className="min-h-20"
              name="bridge_copy"
              defaultValue={module.bridge_copy ?? ''}
              placeholder="Why this module matters to a financial professional"
            />
          </Field>
        </form>
        <div className="flex shrink-0 items-center gap-1">
          <ReorderControls
            label={module.title}
            atStart={modules[0]?.id === module.id}
            atEnd={modules.at(-1)?.id === module.id}
            onUp={() => void handleMutation(reorderModules(orderMove(modules, module.id, -1)))}
            onDown={() => void handleMutation(reorderModules(orderMove(modules, module.id, 1)))}
          />
          <ConfirmDialog
            trigger={
              <button className="button-quiet px-3 text-status-danger" aria-label={`Delete ${module.title}`} type="button">
                <Trash2 className="size-icon-sm" aria-hidden="true" />
              </button>
            }
            title="Delete this module?"
            description={`"${module.title}" and every lesson, resource, and question bank inside it will be permanently removed. This cannot be undone.`}
            confirmLabel="Delete module"
            onConfirm={() => handleMutation(mutate('delete_module', { id: module.id }))}
          />
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {lessons.map((lesson) => (
          <div key={lesson.id} className="space-y-2">
            <div className="flex justify-end">
              <ReorderControls
                label={lesson.title}
                atStart={lesson.position === 1}
                atEnd={lesson.position === lessons.length}
                onUp={() => void handleMutation(reorderLessons(orderMove(lessons, lesson.id, -1)))}
                onDown={() => void handleMutation(reorderLessons(orderMove(lessons, lesson.id, 1)))}
              />
            </div>
            <LessonEditor lesson={lesson} />
          </div>
        ))}
      </div>
      <form className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-dacfp-gray-text p-4 sm:flex-row" onSubmit={(event) => void addLesson(event)}>
        <Input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} required placeholder="New lesson title" aria-label="New lesson title" /><button className="button-secondary shrink-0" disabled={addingLesson} type="submit"><Plus className="size-icon-sm" aria-hidden="true" />{addingLesson ? 'Adding lesson…' : 'Add lesson'}</button>
      </form>
      <QuestionBankPanel module={module} />
    </article>
  );
}

export function AdminCoursePage() {
  const { id } = useParams();
  const { catalog, mutate, exportSurveyResponses } = useAdmin();
  const navigate = useNavigate();
  const course = catalog.courses.find((item) => item.id === id);
  const modules = catalog.modules.filter((item) => item.course_id === id).sort((a, b) => a.position - b.position);
  const [moduleTitle, setModuleTitle] = useState('');
  const [exportError, setExportError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [addingModule, setAddingModule] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(false);
  if (!course) return <div className="card p-8 text-center"><h1 className="text-2xl font-bold text-dacfp-navy">Course unavailable</h1><Link className="button-secondary mt-5" to="/admin">Back to courses</Link></div>;

  const addModule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (addingModule) return;
    setAddingModule(true);
    try {
      await mutate('create_module', { course_id: course.id, title: moduleTitle, ce_credits: null });
      setModuleTitle('');
    } catch {
      // AdminContext owns the mutation failure banner.
    } finally {
      setAddingModule(false);
    }
  };

  const deleteCourse = async () => {
    if (deletingCourse) return;
    setDeletingCourse(true);
    setDeleteError('');
    try {
      await mutate('delete_course', { id: course.id });
      navigate('/admin');
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '';
      setDeleteError(
        /enrollment/i.test(message)
          ? `Deletion refused: “${course.title}” has enrollments. Contact support before attempting any retirement workflow.`
          : `“${course.title}” could not be deleted. No deletion was confirmed.`,
      );
    } finally {
      setDeletingCourse(false);
    }
  };

  return (
    <div className="space-y-8">
      <Link className="button-quiet" to="/admin"><ArrowLeft className="size-icon-sm" aria-hidden="true" />Back to courses</Link>
      <PageHeader
        eyebrow={`Course editor · ${course.status}`}
        title={course.title}
        description="Manage structure, surveys, private resources, fixed-policy question banks, and publication status."
        action={<div className="flex flex-col gap-2 sm:flex-row">
          <button
            className="button-secondary"
            onClick={() => {
              setExportError('');
              void exportSurveyResponses({ course_id: course.id })
                .then((exported) => downloadText(exported.file_name, exported.csv))
                .catch(() => setExportError('Course survey responses could not be exported.'));
            }}
            type="button"
          >
            <Download className="size-icon-sm" aria-hidden="true" />Export all survey responses
          </button>
          <ConfirmDialog
            trigger={<button className="button-secondary text-status-danger" disabled={deletingCourse} type="button"><Trash2 className="size-icon-sm" aria-hidden="true" />{deletingCourse ? 'Deleting course…' : 'Delete course'}</button>}
            title={`Delete “${course.title}”?`}
            description={`This permanently deletes “${course.title}” and cascades through its modules, lessons, quizzes, surveys, and private lesson resources. Any enrollment blocks the operation and requires support.`}
            confirmLabel={`Delete ${course.title}`}
            onConfirm={deleteCourse}
          />
        </div>}
      />
      <ErrorMessage message={exportError} />
      <ErrorMessage message={deleteError} />
      <CourseSettings course={course} />
      <section className="space-y-4" aria-labelledby="modules-heading">
        <div><p className="eyebrow">Curriculum</p><h2 id="modules-heading" className="mt-1 text-2xl font-bold text-dacfp-navy">Modules and lessons</h2><p className="mt-2 text-sm text-dacfp-gray-text">Drag the grip handle to reorder on larger screens, or use the up/down controls on any device.</p></div>
        {modules.length === 0 ? (
          <div className="card border-dashed p-8 text-center">
            <h3 className="text-lg font-bold text-dacfp-navy">No curriculum yet</h3>
            <p className="mt-2 text-sm text-dacfp-gray-text">Add the first module below to start this draft course.</p>
          </div>
        ) : modules.map((module) => <ModuleEditor key={module.id} module={module} modules={modules} />)}
        <form className="card flex flex-col gap-3 p-5 sm:flex-row" onSubmit={(event) => void addModule(event)}>
          <Input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} required placeholder="New module title" aria-label="New module title" /><button className="button-primary shrink-0" disabled={addingModule} type="submit"><Plus className="size-icon-sm" aria-hidden="true" />{addingModule ? 'Adding module…' : 'Add module'}</button>
        </form>
      </section>
    </div>
  );
}

/** Structured evidence for one enrollment — replaces the JSON dumps (brief #21). */
function EnrollmentInspector({
  inspection,
  enrollment,
  onSupport,
}: {
  inspection: LearnerInspection;
  enrollment: AdminEnrollment;
  onSupport: (action: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const { catalog } = useAdmin();
  const summary = inspection.summaries.find((item) => item.enrollment_id === enrollment.id);
  const moduleIds = catalog.modules.filter((item) => item.course_id === enrollment.course_id).map((item) => item.id);
  const quizzes = catalog.quizzes.filter((item) => moduleIds.includes(item.module_id));
  const progress = inspection.progress.filter((item) => item.enrollment_id === enrollment.id);
  const attempts = inspection.attempts.filter((item) => item.enrollment_id === enrollment.id);
  const surveyResponses = inspection.surveyResponses.filter(
    (item) => item.enrollment_id === enrollment.id,
  );
  const surveyLessons = catalog.lessons.filter(
    (item) => moduleIds.includes(item.module_id) && item.kind === 'survey',
  );
  const completion = inspection.completions.find((item) => item.enrollment_id === enrollment.id);
  const learnerName = inspection.profile?.display_name || inspection.user.email;
  const manualCompleteLabel = `Manual mark complete ${enrollment.lms_courses.title} for ${learnerName}`;
  const courseModules = catalog.modules
    .filter((item) => item.course_id === enrollment.course_id)
    .sort((a, b) => a.position - b.position);
  const moduleById = new Map(courseModules.map((item) => [item.id, item]));
  const courseLessons = catalog.lessons
    .filter((item) => moduleIds.includes(item.module_id))
    .sort((a, b) => {
      const moduleDifference = (moduleById.get(a.module_id)?.position ?? 0) - (moduleById.get(b.module_id)?.position ?? 0);
      return moduleDifference || a.position - b.position;
    });
  const lessonById = new Map(courseLessons.map((item) => [item.id, item]));
  const orderedProgress = progress.slice().sort((a, b) => {
    const aIndex = courseLessons.findIndex((lesson) => lesson.id === a.lesson_id);
    const bIndex = courseLessons.findIndex((lesson) => lesson.id === b.lesson_id);
    return aIndex - bIndex;
  });

  const facts: DetailItem[] = [
    { label: 'Status', value: enrollment.status },
    { label: 'Source', value: enrollment.source },
    { label: 'Access expiry', value: formatDate(enrollment.expires_at) },
    { label: 'Enrolled', value: formatDate(enrollment.enrolled_at) },
    { label: 'Terms accepted', value: enrollment.terms_accepted_at ? formatDate(enrollment.terms_accepted_at) : null },
    { label: 'CE credits', value: enrollment.lms_courses.ce_credits ?? null },
    { label: 'Completion', value: completion ? `Fired ${formatDate(completion.completed_at)}` : null },
    { label: 'Enrollment id', value: enrollment.id, mono: true },
  ];

  return (
    <article className="card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">{enrollment.status}</p>
          <h3 className="mt-1 text-xl font-bold text-dacfp-navy">{enrollment.lms_courses.title}</h3>
          <p className="mt-1 text-sm text-dacfp-gray-text">{summary?.percent_complete ?? 0}% complete</p>
        </div>
        {completion ? <StatusPill tone="positive">Completed</StatusPill> : <StatusPill tone="neutral">In progress</StatusPill>}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg bg-dacfp-wash p-4"><p className="text-sm text-dacfp-gray-text">Progress rows</p><p className="text-2xl font-bold tabular-nums text-dacfp-navy">{progress.length}</p></div>
        <div className="rounded-lg bg-dacfp-wash p-4"><p className="text-sm text-dacfp-gray-text">Attempts</p><p className="text-2xl font-bold tabular-nums text-dacfp-navy">{attempts.length}</p></div>
        <div className="rounded-lg bg-dacfp-wash p-4"><p className="text-sm text-dacfp-gray-text">Survey submissions</p><p className="text-2xl font-bold tabular-nums text-dacfp-navy">{surveyResponses.length} / {surveyLessons.length}</p></div>
        <div className="rounded-lg bg-dacfp-wash p-4"><p className="text-sm text-dacfp-gray-text">CE credits</p><p className="text-2xl font-bold tabular-nums text-dacfp-navy">{enrollment.lms_courses.ce_credits ?? '—'}</p></div>
      </div>

      <div className="mt-5 border-t border-dacfp-line pt-5">
        <DetailList items={facts} />
      </div>

      <details className="mt-5 border-t border-dacfp-line pt-5">
        <summary className="cursor-pointer text-sm font-bold text-dacfp-navy">Lesson progress ({progress.length})</summary>
        {orderedProgress.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {orderedProgress.map((item) => {
              const lesson = lessonById.get(item.lesson_id);
              return (
                <li className="grid gap-1 rounded-lg border border-dacfp-line px-3 py-2 text-sm sm:grid-cols-[1fr_auto] sm:items-center" key={item.id}>
                  <span className="font-semibold text-dacfp-navy">{lesson?.title ?? `Lesson ${item.lesson_id}`}</span>
                  <span className="text-dacfp-gray-text">{item.completed_at ? `Completed ${formatDate(item.completed_at)}` : `Resume at ${formatClock(item.last_position_seconds)}`}</span>
                  <span className="text-xs text-dacfp-gray-text sm:col-span-2">Updated {formatDate(item.updated_at)}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-3 text-sm text-dacfp-gray-text">No lesson progress has been recorded.</p>}
      </details>

      {attempts.length > 0 ? (
        <div className="mt-5 border-t border-dacfp-line pt-5">
          <h4 className="text-sm font-bold text-dacfp-navy">Quiz attempts</h4>
          <ul className="mt-3 space-y-2">
            {attempts
              .slice()
              .sort((a, b) => b.attempt_number - a.attempt_number)
              .map((attempt) => (
                <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dacfp-line px-3 py-2 text-sm">
                  <span className="font-semibold text-dacfp-navy">Attempt {attempt.attempt_number}</span>
                  <span className="tabular-nums text-dacfp-gray-text">
                    {attempt.submitted_at ? `Score ${attempt.score ?? 0}` : 'In progress'}
                  </span>
                  {attempt.submitted_at ? (
                    <StatusPill tone={attempt.passed ? 'positive' : 'warning'}>{attempt.passed ? 'Passed' : 'Not passed'}</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">Unsubmitted</StatusPill>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {surveyLessons.length > 0 ? (
        <div className="mt-5 border-t border-dacfp-line pt-5">
          <h4 className="text-sm font-bold text-dacfp-navy">Survey submission status</h4>
          <ul className="mt-3 space-y-2">
            {surveyLessons.map((lesson) => {
              const response = surveyResponses.find((item) => item.lesson_id === lesson.id);
              return (
                <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dacfp-line px-3 py-2 text-sm" key={lesson.id}>
                  <span className="font-semibold text-dacfp-navy">{lesson.title}</span>
                  <StatusPill tone={response ? 'positive' : 'neutral'}>
                    {response ? `Submitted ${formatDate(response.submitted_at)}` : 'Not submitted'}
                  </StatusPill>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 border-t border-dacfp-line pt-5 sm:flex-row sm:flex-wrap">
        <ConfirmDialog
          trigger={<button aria-label={manualCompleteLabel} className="button-secondary" type="button"><CheckCircle2 className="size-icon-sm" aria-hidden="true" />{manualCompleteLabel}</button>}
          title="Mark this enrollment complete?"
          description={`This records a manual completion event for "${enrollment.lms_courses.title}" against this learner. It is written to the audit trail.`}
          confirmLabel="Mark complete"
          onConfirm={() => onSupport('manual_mark_complete', { enrollment_id: enrollment.id })}
        />
        {quizzes.map((quiz) => {
          const module = moduleById.get(quiz.module_id);
          const moduleName = module?.position === 0 ? 'Introduction' : `Module ${module?.position ?? 'unknown'}`;
          const quizName = module?.title ?? `Quiz ${quiz.id}`;
          const resetLabel = `Reset ${moduleName} “${quizName}” quiz attempts in ${enrollment.lms_courses.title} for ${learnerName}`;
          return (
            <ConfirmDialog
              key={quiz.id}
              trigger={<button aria-label={resetLabel} className="button-secondary" type="button">{resetLabel}</button>}
              title={`${resetLabel}?`}
              description={`Every recorded attempt for “${module?.title ?? moduleName}” will be permanently removed for ${learnerName}. Their pass/fail state is recomputed from an empty history. This cannot be undone.`}
              confirmLabel={resetLabel}
              onConfirm={() => onSupport('reset_attempt_history', { enrollment_id: enrollment.id, quiz_id: quiz.id })}
            />
          );
        })}
      </div>
    </article>
  );
}

export function AdminNotFoundPage() {
  return (
    <section className="card p-6 sm:p-8" role="status">
      <PageHeader
        eyebrow="Operator console"
        title="Admin page not found"
        description="This admin destination does not exist. The operator workspace remains available."
      />
      <Link className="button-primary mt-6" to="/admin">Return to course catalog</Link>
    </section>
  );
}

export function AdminLearnersPage() {
  const { inspectLearner, mutate } = useAdmin();
  const [email, setEmail] = useState('');
  const [inspection, setInspection] = useState<LearnerInspection | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [searching, setSearching] = useState(false);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (searching) return;
    setSearching(true); setError(''); setMessage(''); setInspection(undefined);
    try { setInspection(await inspectLearner(email)); }
    catch { setError('Learner inspection failed.'); }
    finally { setSearching(false); }
  };

  const support = async (action: string, payload: Record<string, unknown>) => {
    setError(''); setMessage('');
    try {
      await mutate<Record<string, unknown>>(action, payload);
    } catch {
      setError('Support action failed. No change was confirmed.');
      return;
    }
    setMessage(`${action.replaceAll('_', ' ')} completed.`);
    try {
      setInspection(await inspectLearner(email));
    } catch {
      setError('The support action completed, but the learner inspector could not be refreshed.');
    }
  };

  const profileFacts: DetailItem[] = inspection
    ? [
        { label: 'Email', value: inspection.user.email, mono: true },
        { label: 'Display name', value: inspection.profile?.display_name ?? null },
        { label: 'First name', value: inspection.profile?.first_name ?? null },
        { label: 'Last name', value: inspection.profile?.last_name ?? null },
        { label: 'Firm', value: inspection.profile?.firm ?? null },
        { label: 'Job title', value: inspection.profile?.job_title ?? null },
        { label: 'Phone', value: inspection.profile?.phone ?? null },
        { label: 'Firm website', value: inspection.profile?.firm_url ?? null },
        {
          label: 'Address',
          value: inspection.profile?.address
            ? [
                inspection.profile.address.line1,
                inspection.profile.address.line2,
                inspection.profile.address.city,
                inspection.profile.address.state,
                inspection.profile.address.postal,
                inspection.profile.address.country,
              ].filter(Boolean).join(', ') || null
            : null,
        },
        { label: 'CFP ID', value: inspection.profile?.credential_ids?.cfp ?? null, mono: true },
        { label: 'IWI ID', value: inspection.profile?.credential_ids?.iwi ?? null, mono: true },
        { label: 'CFA ID', value: inspection.profile?.credential_ids?.cfa ?? null, mono: true },
      ]
    : [];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Learner support" title="Per-learner inspector" description="Search one person by email, review enrollment evidence, and use only the two audited support actions." />
      <form className="card flex flex-col gap-3 p-5 sm:flex-row" onSubmit={(event) => void search(event)}><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="learner@example.test" required aria-label="Learner email" /><button className="button-primary shrink-0" disabled={searching} type="submit"><Search className="size-icon-sm" aria-hidden="true" />{searching ? 'Inspecting learner…' : 'Inspect learner'}</button></form>
      <ErrorMessage message={error} /><SuccessMessage message={message} />
      {inspection === null ? <div className="card p-8 text-center"><h2 className="text-xl font-bold text-dacfp-navy">No learner found</h2><p className="mt-2 text-dacfp-gray-text">Check the exact email and try again.</p></div> : null}
      {inspection ? (
        <div className="space-y-6">
          <section className="card p-5 sm:p-6" aria-labelledby="learner-profile-heading">
            <h2 id="learner-profile-heading" className="text-xl font-bold text-dacfp-navy">{inspection.profile?.display_name || inspection.user.email}</h2>
            <p className="mt-1 text-sm text-dacfp-gray-text">Profile and credential IDs</p>
            <div className="mt-4"><DetailList items={profileFacts} /></div>
          </section>
          {inspection.enrollments.map((enrollment) => (
            <EnrollmentInspector key={enrollment.id} inspection={inspection} enrollment={enrollment} onSupport={support} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminAuditPage() {
  const { audit } = useAdmin();
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Accountability" title="Admin audit trail" description="Every admin mutation, including CRUD, import, upload, reorder, and support actions, is written by the service boundary." action={<div className="flex items-center gap-2 rounded-lg bg-status-positive/10 px-3 py-2 text-sm font-bold text-status-positive"><ShieldCheck className="size-icon-md" aria-hidden="true" />{audit.length} recent actions</div>} />

      {/* brief #21: a real table at md and up; card-per-row below it, because a
          4-column table does not survive 375px. Same data, two presentations. */}
      <div className="hidden md:block">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.map((action) => (
                  <TableRow key={action.id}>
                    <TableCell className="whitespace-nowrap text-dacfp-gray-text">{new Date(action.created_at).toLocaleString()}</TableCell>
                    <TableCell className="font-bold text-dacfp-navy">{action.action}</TableCell>
                    <TableCell className="font-mono text-xs">{action.actor_auth_user_id}</TableCell>
                    <TableCell><AuditTarget target={action.target} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <ul className="space-y-3 md:hidden">
        {audit.map((action) => (
          <li key={action.id} className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-dacfp-navy">{action.action}</span>
              <span className="shrink-0 text-xs text-dacfp-gray-text">{new Date(action.created_at).toLocaleString()}</span>
            </div>
            <dl className="mt-3 space-y-2 border-t border-dacfp-line pt-3 text-sm">
              <div className="flex gap-2"><dt className="shrink-0 font-semibold text-dacfp-gray-text">Actor</dt><dd className="min-w-0 break-all font-mono text-xs text-dacfp-navy">{action.actor_auth_user_id}</dd></div>
              <div><dt className="font-semibold text-dacfp-gray-text">Target</dt><dd className="mt-1"><AuditTarget target={action.target} /></dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Audit target as labelled key-values, not JSON.stringify (brief #21). The
 * target is a flat record of id/kind fields, so a compact chip list reads at a
 * glance where a brace-wrapped blob did not.
 */
function AuditTarget({ target }: { target: Record<string, unknown> }) {
  const entries = Object.entries(target);
  if (entries.length === 0) return <span className="text-dacfp-gray-text">—</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <li key={key} className="inline-flex max-w-full items-baseline gap-1 rounded-md bg-dacfp-wash px-2 py-1 text-xs">
          <span className="font-semibold text-dacfp-gray-text">{key}</span>
          <span className="truncate font-mono text-dacfp-navy">{formatTargetValue(value)}</span>
        </li>
      ))}
    </ul>
  );
}

function formatTargetValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  // ordered_ids and similar arrays: show the count, not a wall of ids.
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') return 'object';
  return String(value);
}
