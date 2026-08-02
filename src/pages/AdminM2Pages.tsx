import {
  ArrowLeft,
  CheckCircle2,
  Download,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert } from '../components/Alert';
import { Field } from '../components/Field';
import { EmptyState, PageHeader, StatusPill, formatDate } from '../components/common';
import { useAdmin } from '../context/AdminContext';
import type {
  QuizAnalytics,
  QuizAnalyticsQuestion,
  SurveyBrowserFilters,
  SurveyBrowserResult,
  SurveyExport,
  SurveyResponseDetail,
} from '../data/admin';

const selectClass =
  'min-h-11 w-full rounded-lg border border-input bg-transparent px-3.5 py-2 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm';
const SURVEY_PAGE_SIZE = 10;

function downloadText(fileName: string, content: string) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
}

function percent(value: number | null) {
  return value === null ? 'Insufficient data' : `${value}%`;
}

function decimal(value: number | null) {
  return value === null ? 'Insufficient data' : value.toFixed(2);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(value));
}

function completionContext(completedAt: string | null, enrollmentStatus: string) {
  return completedAt
    ? `Course completed ${formatDate(completedAt)}`
    : `${enrollmentStatus} enrollment · completion not recorded`;
}

export function AdminQuizAnalyticsPage() {
  const { catalog, request } = useAdmin();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<QuizAnalytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);
  const quizModuleIds = useMemo(
    () => new Set(catalog.quizzes.map((quiz) => quiz.module_id)),
    [catalog.quizzes],
  );
  const courseIdsWithQuizzes = useMemo(
    () => new Set(
      catalog.modules
        .filter((module) => quizModuleIds.has(module.id))
        .map((module) => module.course_id),
    ),
    [catalog.modules, quizModuleIds],
  );
  const courses = catalog.courses.filter((course) => courseIdsWithQuizzes.has(course.id));
  const selectedCourseId = courses.some((course) => course.id === params.get('course'))
    ? params.get('course')!
    : courses[0]?.id ?? '';

  const load = useCallback(() => {
    if (!selectedCourseId) return;
    const sequence = ++requestSequence.current;
    setData(null);
    setLoading(true);
    setError('');
    request<QuizAnalytics>('quiz_analytics', { course_id: selectedCourseId })
      .then((response) => {
        if (sequence === requestSequence.current) setData(response);
      })
      .catch(() => {
        if (sequence === requestSequence.current) setError('Quiz analytics could not be loaded.');
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false);
      });
  }, [request, selectedCourseId]);

  useEffect(() => { load(); }, [load]);

  const selectedModule = data?.modules.find((module) => module.module_id === params.get('module'))
    ?? data?.modules[0]
    ?? null;
  const questionSort = params.get('sort') ?? 'worst';
  const sortedQuestions = useMemo(() => {
    const questions = [...(selectedModule?.questions ?? [])];
    if (questionSort === 'position') return questions.sort((a, b) => a.position - b.position);
    if (questionSort === 'lowest') {
      return questions.sort((a, b) => {
        if (a.miss_rate === null && b.miss_rate === null) return a.position - b.position;
        if (a.miss_rate === null) return 1;
        if (b.miss_rate === null) return -1;
        return a.miss_rate - b.miss_rate || a.position - b.position;
      });
    }
    return questions.sort((a, b) => {
      if (a.miss_rate === null && b.miss_rate === null) return a.position - b.position;
      if (a.miss_rate === null) return 1;
      if (b.miss_rate === null) return -1;
      return b.miss_rate - a.miss_rate || a.position - b.position;
    });
  }, [questionSort, selectedModule]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'course') next.delete('module');
    setParams(next);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Quiz analytics"
        title="Question quality and outcomes"
        description="Aggregate submitted attempts only. No learner-identifying drill-down is available here, and the published 10-question, 70%, unlimited-attempt exam policy is unchanged."
      />
      {error ? <Alert tone="danger">{error} <button className="font-bold underline" type="button" onClick={load}>Retry</button></Alert> : null}

      <section className="card grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-label="Quiz analytics controls">
        <Field label="Course">
          <select
            className={selectClass}
            value={selectedCourseId}
            onChange={(event) => setParam('course', event.target.value)}
          >
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select>
        </Field>
        <div className="rounded-lg bg-dacfp-wash-blue p-4 text-sm leading-6 text-dacfp-gray-text">
          <p className="font-bold text-dacfp-navy">Named population</p>
          <p><code>{data?.population_views.attempts ?? 'v_lms_m2_quiz_attempt_population'}</code></p>
          <p>Derived rates require at least {data?.minimum_attempts ?? 3} submitted attempts.</p>
        </div>
      </section>

      {loading && !data ? <p role="status" className="text-sm text-dacfp-gray-text">Loading quiz analytics…</p> : null}
      {!loading && !error && !data ? (
        <EmptyState title="No quiz analytics" description="No course with a question bank is available." />
      ) : null}

      {data ? (
        <>
          <section aria-labelledby="course-rollup-heading">
            <div className="mb-4">
              <h2 id="course-rollup-heading" className="text-2xl font-bold text-dacfp-navy">Course rollup</h2>
              <p className="mt-1 text-sm text-dacfp-gray-text">One aggregate view across every submitted quiz attempt in {data.course.title}.</p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="card p-4"><dt className="text-xs font-bold uppercase tracking-wide text-dacfp-gray-text">Attempts</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-dacfp-navy">{data.course_rollup.attempts}</dd></div>
              <div className="card p-4"><dt className="text-xs font-bold uppercase tracking-wide text-dacfp-gray-text">Unique learners</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-dacfp-navy">{data.course_rollup.unique_learners}</dd></div>
              <div className="card p-4"><dt className="text-xs font-bold uppercase tracking-wide text-dacfp-gray-text">Pass rate</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-dacfp-navy">{percent(data.course_rollup.pass_rate)}</dd></div>
              <div className="card p-4"><dt className="text-xs font-bold uppercase tracking-wide text-dacfp-gray-text">Avg. attempts-to-pass</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-dacfp-navy">{decimal(data.course_rollup.average_attempts_to_pass)}</dd></div>
              <div className="card p-4"><dt className="text-xs font-bold uppercase tracking-wide text-dacfp-gray-text">Retakes</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-dacfp-navy">{data.course_rollup.retake_volume}</dd></div>
            </dl>
            {data.course_rollup.insufficient_data ? (
              <p className="mt-3 text-sm text-dacfp-gray-text">Derived course rates are hidden until at least {data.minimum_attempts} submitted attempts exist.</p>
            ) : null}
          </section>
          <section aria-labelledby="module-rollups-heading">
            <div className="mb-4">
              <h2 id="module-rollups-heading" className="text-2xl font-bold text-dacfp-navy">Module rollups</h2>
              <p className="mt-1 text-sm text-dacfp-gray-text">Pass rate is passed submitted attempts ÷ submitted attempts. Average attempts-to-pass uses each passing learner’s first passed attempt number.</p>
            </div>
            <div className="hidden overflow-hidden rounded-xl border border-dacfp-line bg-white md:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Module</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead>Unique learners</TableHead>
                      <TableHead>Pass rate</TableHead>
                      <TableHead>Avg. attempts-to-pass</TableHead>
                      <TableHead>Retakes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.modules.map((module) => (
                      <TableRow key={module.module_id}>
                        <TableCell>
                          <button className="min-h-11 text-left font-bold text-dacfp-navy hover:underline" type="button" onClick={() => setParam('module', module.module_id)}>
                            {module.position}. {module.title}
                          </button>
                        </TableCell>
                        <TableCell className="tabular-nums">{module.attempts}</TableCell>
                        <TableCell className="tabular-nums">{module.unique_learners}</TableCell>
                        <TableCell className="tabular-nums">{percent(module.pass_rate)}</TableCell>
                        <TableCell className="tabular-nums">{decimal(module.average_attempts_to_pass)}</TableCell>
                        <TableCell className="tabular-nums">{module.retake_volume}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <ul className="space-y-3 md:hidden">
              {data.modules.map((module) => (
                <li key={module.module_id}>
                  <button className="card block min-h-11 w-full p-4 text-left" type="button" onClick={() => setParam('module', module.module_id)}>
                    <span className="font-bold text-dacfp-navy">{module.position}. {module.title}</span>
                    <span className="mt-2 grid grid-cols-2 gap-2 text-sm text-dacfp-gray-text">
                      <span>{module.attempts} attempts</span>
                      <span>{module.unique_learners} learners</span>
                      <span>{percent(module.pass_rate)} pass rate</span>
                      <span>{module.retake_volume} retakes</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {selectedModule ? (
            <section className="space-y-5" aria-labelledby="question-analytics-heading">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="eyebrow">Module {selectedModule.position}</p>
                  <h2 id="question-analytics-heading" className="mt-1 text-2xl font-bold text-dacfp-navy">{selectedModule.title} questions</h2>
                  <p className="mt-1 text-sm text-dacfp-gray-text">Correct-answer flags are visible only on this operator surface.</p>
                </div>
                <Field label="Question order">
                  <select className={selectClass} value={questionSort} onChange={(event) => setParam('sort', event.target.value)}>
                    <option value="worst">Miss rate · worst first</option>
                    <option value="lowest">Miss rate · lowest first</option>
                    <option value="position">Bank order</option>
                  </select>
                </Field>
              </div>
              {selectedModule.insufficient_data ? (
                <Alert tone="warning">Insufficient data: this module has {selectedModule.attempts} submitted attempts; at least {data.minimum_attempts} are required before derived rates or distributions are shown.</Alert>
              ) : null}
              <div className="space-y-4">
                {sortedQuestions.map((question) => (
                  <QuestionAnalyticsCard key={question.question_id} question={question} minimum={data.minimum_attempts} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function QuestionAnalyticsCard({ question, minimum }: { question: QuizAnalyticsQuestion; minimum: number }) {
  return (
    <article className="card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-dacfp-gray-text">Question {question.position}</p>
          <h3 className="mt-1 text-lg font-bold leading-7 text-dacfp-navy">{question.prompt}</h3>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <StatusPill tone="neutral">{question.attempt_count} attempts</StatusPill>
          <StatusPill tone={question.insufficient_data ? 'warning' : 'current'}>
            {question.miss_rate === null ? 'Insufficient data' : `${question.miss_rate}% missed`}
          </StatusPill>
        </div>
      </div>
      {question.insufficient_data ? (
        <p className="mt-4 rounded-lg bg-dacfp-wash-blue p-3 text-sm leading-6 text-dacfp-gray-text">
          At least {minimum} submitted attempts are required before this question’s miss rate and choice distribution are shown.
        </p>
      ) : null}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {question.choices.map((choice) => (
          <li key={choice.id} className="rounded-lg border border-dacfp-line p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-semibold leading-6 text-dacfp-navy">{choice.text}</span>
              {choice.correct ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-status-positive">
                  <CheckCircle2 className="size-icon-sm" aria-hidden="true" />Correct
                </span>
              ) : null}
            </div>
            {!question.insufficient_data ? (
              <p className="mt-2 text-sm tabular-nums text-dacfp-gray-text">Selected {choice.selected_count} times · {choice.selected_pct}%</p>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}

function filtersFromParams(params: URLSearchParams): SurveyBrowserFilters {
  return {
    course_id: params.get('course') || undefined,
    survey_id: params.get('survey') || undefined,
    submitted_from: params.get('from') || undefined,
    submitted_to: params.get('to') || undefined,
  };
}

export function AdminSurveyResponsesPage() {
  const { catalog, request } = useAdmin();
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState<SurveyBrowserResult | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const listRequestSequence = useRef(0);
  const page = Math.max(Number(params.get('page') ?? '1') || 1, 1);
  const appliedCourse = params.get('course') ?? '';
  const appliedSurvey = params.get('survey') ?? '';
  const appliedFrom = params.get('from') ?? '';
  const appliedTo = params.get('to') ?? '';
  const [draft, setDraft] = useState(() => ({
    course: appliedCourse,
    survey: appliedSurvey,
    from: appliedFrom,
    to: appliedTo,
  }));
  const moduleById = useMemo(
    () => new Map(catalog.modules.map((module) => [module.id, module])),
    [catalog.modules],
  );
  const surveys = catalog.lessons.filter((lesson) => {
    if (lesson.kind !== 'survey') return false;
    if (!draft.course) return true;
    return moduleById.get(lesson.module_id)?.course_id === draft.course;
  });

  const load = useCallback(() => {
    const sequence = ++listRequestSequence.current;
    setError('');
    setResult(null);
    request<SurveyBrowserResult>('list_survey_responses', {
      ...filtersFromParams(params),
      page,
      page_size: SURVEY_PAGE_SIZE,
    })
      .then((response) => {
        if (sequence !== listRequestSequence.current) return;
        const maximumPage = Math.max(Math.ceil(response.total / response.page_size), 1);
        if (page > maximumPage) {
          const next = new URLSearchParams(params);
          if (maximumPage === 1) next.delete('page');
          else next.set('page', String(maximumPage));
          setParams(next, { replace: true });
          return;
        }
        setResult(response);
      })
      .catch(() => {
        if (sequence === listRequestSequence.current) {
          setError('Survey responses could not be loaded.');
        }
      });
  }, [page, params, request, setParams]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setDraft({
      course: appliedCourse,
      survey: appliedSurvey,
      from: appliedFrom,
      to: appliedTo,
    });
  }, [appliedCourse, appliedFrom, appliedSurvey, appliedTo]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (draft.course) next.set('course', draft.course);
    if (draft.survey) next.set('survey', draft.survey);
    if (draft.from) next.set('from', draft.from);
    if (draft.to) next.set('to', draft.to);
    setParams(next);
  };

  const clearFilters = () => {
    setDraft({ course: '', survey: '', from: '', to: '' });
    setParams(new URLSearchParams());
  };

  const exportFiltered = async () => {
    setExporting(true);
    setError('');
    try {
      const exported = await request<SurveyExport>(
        'export_m2_survey_responses',
        { ...filtersFromParams(params) },
      );
      downloadText(exported.file_name, exported.csv);
    } catch {
      setError('The filtered survey CSV could not be exported.');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = result ? Math.max(Math.ceil(result.total / SURVEY_PAGE_SIZE), 1) : 1;
  const detailSearch = params.toString();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Survey responses"
        title="Read-only response browser"
        description="Browse immutable routed submissions in presented order. Filters and pagination execute against the named survey-response population on the server."
        action={(
          <button className="button-secondary" disabled={exporting} type="button" onClick={() => void exportFiltered()}>
            <Download className="size-icon-sm" aria-hidden="true" />{exporting ? 'Preparing export…' : 'Export filtered CSV'}
          </button>
        )}
      />
      {error ? <Alert tone="danger">{error} <button className="font-bold underline" type="button" onClick={load}>Retry</button></Alert> : null}

      <form className="card space-y-4 p-5" onSubmit={applyFilters} aria-label="Survey response filters">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Course">
            <select
              className={selectClass}
              value={draft.course}
              onChange={(event) => setDraft((current) => ({ ...current, course: event.target.value, survey: '' }))}
            >
              <option value="">All courses</option>
              {catalog.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </Field>
          <Field label="Survey">
            <select className={selectClass} value={draft.survey} onChange={(event) => setDraft((current) => ({ ...current, survey: event.target.value }))}>
              <option value="">All surveys</option>
              {surveys.map((survey) => <option key={survey.id} value={survey.id}>{survey.title}</option>)}
            </select>
          </Field>
          <Field label="Submitted from (UTC)">
            <Input type="date" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} />
          </Field>
          <Field label="Submitted through (UTC)">
            <Input type="date" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="button-primary" type="submit">Apply filters</button>
          <button className="button-quiet" type="button" onClick={clearFilters}>Clear</button>
        </div>
      </form>

      <section aria-label="Survey response results">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-dacfp-gray-text" role="status">
            {result ? `${result.total} response${result.total === 1 ? '' : 's'} match the current filters.` : 'Loading responses…'}
          </p>
          <p className="text-xs text-dacfp-gray-text"><code>{result?.population_view ?? 'v_lms_m2_survey_response_population'}</code></p>
        </div>

        {result?.rows.length ? (
          <>
            <div className="mt-4 hidden overflow-hidden rounded-xl border border-dacfp-line bg-white md:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Learner</TableHead>
                      <TableHead>Course / survey</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Completion context</TableHead>
                      <TableHead><span className="sr-only">Open response</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row) => (
                      <TableRow key={row.response_id}>
                        <TableCell className="font-semibold text-dacfp-navy">{row.learner_email}</TableCell>
                        <TableCell><span className="font-semibold text-dacfp-navy">{row.course_title}</span><br /><span className="text-sm text-dacfp-gray-text">{row.survey_title}</span></TableCell>
                        <TableCell className="whitespace-nowrap">{dateTime(row.submitted_at)}</TableCell>
                        <TableCell>{completionContext(row.course_completed_at, row.enrollment_status)}</TableCell>
                        <TableCell><Link className="button-quiet" to={`/admin/surveys/${row.response_id}${detailSearch ? `?${detailSearch}` : ''}`}>View</Link></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <ul className="mt-4 space-y-3 md:hidden">
              {result.rows.map((row) => (
                <li key={row.response_id} className="card p-4">
                  <p className="font-bold text-dacfp-navy">{row.learner_email}</p>
                  <p className="mt-1 text-sm text-dacfp-gray-text">{row.course_title} · {row.survey_title}</p>
                  <p className="mt-2 text-sm text-dacfp-gray-text">{dateTime(row.submitted_at)}</p>
                  <p className="mt-1 text-sm text-dacfp-gray-text">{completionContext(row.course_completed_at, row.enrollment_status)}</p>
                  <Link className="button-quiet mt-3" to={`/admin/surveys/${row.response_id}${detailSearch ? `?${detailSearch}` : ''}`}>View response</Link>
                </li>
              ))}
            </ul>
          </>
        ) : result ? (
          <div className="mt-4"><EmptyState title="No matching responses" description="Adjust the course, survey, or submitted-date filters and try again." /></div>
        ) : null}

        <nav className="mt-4 flex items-center justify-between" aria-label="Survey response pages">
          <button className="button-quiet" disabled={page <= 1} type="button" onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set('page', String(page - 1)); return next; })}>← Previous</button>
          <p className="text-sm tabular-nums text-dacfp-gray-text">Page {page} of {totalPages}</p>
          <button className="button-quiet" disabled={page >= totalPages} type="button" onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set('page', String(page + 1)); return next; })}>Next →</button>
        </nav>
      </section>
    </div>
  );
}

export function AdminSurveyResponseDetailPage() {
  const { request } = useAdmin();
  const { responseId = '' } = useParams();
  const [params] = useSearchParams();
  const [detail, setDetail] = useState<SurveyResponseDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    request<SurveyResponseDetail>('survey_response_detail', { response_id: responseId })
      .then((response) => { if (!cancelled) setDetail(response); })
      .catch(() => { if (!cancelled) setError('This survey response could not be loaded.'); });
    return () => { cancelled = true; };
  }, [request, responseId]);

  const backSearch = params.toString();
  return (
    <div className="space-y-8">
      <Link className="button-quiet" to={`/admin/surveys${backSearch ? `?${backSearch}` : ''}`}>
        <ArrowLeft className="size-icon-sm" aria-hidden="true" />Back to responses
      </Link>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!detail && !error ? <p role="status" className="text-sm text-dacfp-gray-text">Loading response…</p> : null}
      {detail ? (
        <>
          <PageHeader
            eyebrow="Read-only survey response"
            title={detail.survey_title}
            description="The section path and answers are the immutable values stored with this submission. Question labels reflect the current survey definition. There are no edit, annotation, or status controls."
            action={<StatusPill tone="neutral">Read only</StatusPill>}
          />
          <section className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4" aria-label="Response context">
            <div><p className="text-xs font-bold uppercase tracking-wide text-dacfp-gray-text">Learner</p><p className="mt-1 break-all font-semibold text-dacfp-navy">{detail.learner_email}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-wide text-dacfp-gray-text">Course</p><p className="mt-1 font-semibold text-dacfp-navy">{detail.course_title}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-wide text-dacfp-gray-text">Submitted</p><p className="mt-1 font-semibold text-dacfp-navy">{dateTime(detail.submitted_at)}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-wide text-dacfp-gray-text">Completion context</p><p className="mt-1 font-semibold text-dacfp-navy">{completionContext(detail.course_completed_at, detail.enrollment_status)}</p></div>
          </section>
          <ol className="space-y-5" aria-label="Presented response path">
            {detail.sections.map((section, sectionIndex) => (
              <li key={section.section_id} className="card p-5 sm:p-6">
                <div className="border-b border-dacfp-line pb-4">
                  <p className="eyebrow">Presented section {sectionIndex + 1}</p>
                  <h2 className="mt-1 text-xl font-bold text-dacfp-navy">{section.title ?? `Section ${section.position}`}</h2>
                </div>
                <ol className="mt-5 space-y-5">
                  {section.answers.map((answer, answerIndex) => (
                    <li key={answer.question_id}>
                      <p className="text-sm font-bold leading-6 text-dacfp-navy">{answerIndex + 1}. {answer.prompt}</p>
                      {answer.answer_lines.length ? (
                        <div className="mt-2 space-y-2">
                          {answer.answer_lines.map((line, index) => (
                            <p key={index} className="whitespace-pre-wrap rounded-lg bg-dacfp-wash-blue p-3 text-sm leading-6 text-dacfp-navy">{line}</p>
                          ))}
                        </div>
                      ) : <p className="mt-2 text-sm italic text-dacfp-gray-text">No answer submitted.</p>}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
          <p className="text-xs text-dacfp-gray-text">Population: <code>{detail.population_view}</code></p>
        </>
      ) : null}
    </div>
  );
}
