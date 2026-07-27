import { AlertTriangle, Download, FileSpreadsheet, History } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert } from '../components/Alert';
import { PageHeader, StatusPill } from '../components/common';
import { useAdmin } from '../context/AdminContext';
import type { CfpCeExportRow, CfpCePreview, CfpCeReportRun } from '../data/admin';
import { downloadCfpCeWorkbook } from '../lib/cfpCeExport';

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function thirtyDaysAgo() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 30);
  return isoDate(date);
}

function defaultStart(courseIds: string[], runs: CfpCeReportRun[]) {
  const today = isoDate(new Date());
  const starts = courseIds.map((courseId) => {
    const latest = runs
      .filter((run) => run.course_ids.includes(courseId))
      .map((run) => run.period_end)
      .sort()
      .at(-1);
    return latest ? [addDays(latest, 1), today].sort()[0] : thirtyDaysAgo();
  });
  return starts.sort()[0] ?? thirtyDaysAgo();
}

function ScopeRows({ title, rows, tone }: {
  title: string;
  rows: CfpCeExportRow[];
  tone: 'positive' | 'warning' | 'neutral';
}) {
  return (
    <section className="card overflow-hidden" aria-labelledby={`${title.toLowerCase().replaceAll(' ', '-')}-heading`}>
      <div className="flex items-center justify-between gap-3 border-b border-dacfp-line px-5 py-4">
        <h2 id={`${title.toLowerCase().replaceAll(' ', '-')}-heading`} className="font-bold text-dacfp-navy">{title}</h2>
        <StatusPill tone={tone}>{rows.length}</StatusPill>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Course program</TableHead><TableHead>Completed</TableHead><TableHead>Learner</TableHead><TableHead>CFP Board ID</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${title}-${row.completion_id}`}>
                  <TableCell className="font-mono text-xs">{row.cfp_program_id}</TableCell>
                  <TableCell>{row.date_individual_completed}</TableCell>
                  <TableCell><span className="font-semibold text-dacfp-navy">{[row.attendee_first_name, row.attendee_middle_name, row.attendee_last_name].filter(Boolean).join(' ')}</span><span className="block text-xs text-dacfp-gray-text">{row.person_email}</span></TableCell>
                  <TableCell className="font-mono text-xs">{row.attendee_cfp_board_id || 'Missing'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : <p className="px-5 py-6 text-sm text-dacfp-gray-text">No completions in this category.</p>}
    </section>
  );
}

export function CeReportingPage() {
  const { catalog, previewCeReport, createCeReportRun, listCeReportRuns } = useAdmin();
  const reportCourses = useMemo(
    () => catalog.courses.filter((course) => course.status !== 'archived'),
    [catalog.courses],
  );
  const initiallySelected = reportCourses
    .filter((course) => course.cfp_program_id)
    .map((course) => course.id);
  const [courseIds, setCourseIds] = useState<string[]>(initiallySelected);
  const [periodStart, setPeriodStart] = useState(thirtyDaysAgo());
  const [periodEnd, setPeriodEnd] = useState(isoDate(new Date()));
  const [includeAlreadyReported, setIncludeAlreadyReported] = useState(false);
  const [preview, setPreview] = useState<CfpCePreview | null>(null);
  const [runs, setRuns] = useState<CfpCeReportRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void listCeReportRuns()
      .then((history) => {
        if (!active) return;
        setRuns(history);
        setPeriodStart(defaultStart(initiallySelected, history));
      })
      .catch(() => active && setError('CE report history could not be loaded.'));
    return () => { active = false; };
  // Catalog is stable for the mounted operator workspace.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listCeReportRuns]);

  const scope = {
    course_ids: courseIds,
    period_start: periodStart,
    period_end: periodEnd,
    include_already_reported: includeAlreadyReported,
  };

  const runPreview = async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      setPreview(await previewCeReport(scope));
    } catch {
      setError('The CE report preview could not be loaded. Check the scope and try again.');
    } finally {
      setLoading(false);
    }
  };

  const exportRun = async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const run = await createCeReportRun(scope);
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      try {
        await downloadCfpCeWorkbook(run.rows, run.filename);
        setMessage(`Exported ${run.row_count} row${run.row_count === 1 ? '' : 's'} and recorded the frozen report run.`);
      } catch {
        setMessage('The report run was recorded, but the download could not start. Download it again from run history.');
      }
      setPreview(await previewCeReport(scope));
    } catch {
      setError('The CE report was not created. No run was confirmed.');
    } finally {
      setLoading(false);
    }
  };

  const toggleCourse = (courseId: string) => {
    setCourseIds((current) => {
      const next = current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId];
      setPeriodStart(defaultStart(next, runs));
      setPreview(null);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Compliance operations" title="CFP CE reporting" description="Preview completion eligibility, surface missing CFP Board IDs, and create retained report runs from frozen export rows." />

      {preview?.nudge_count ? (
        <Alert tone="warning"><span className="font-bold">14-day reporting nudge:</span> {preview.nudge_count} certification{preview.nudge_count === 1 ? ' is' : 's are'} more than 10 days old and not yet present in a report run.</Alert>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="positive">{message}</Alert> : null}

      <section className="card p-5 sm:p-6" aria-labelledby="report-scope-heading">
        <div className="flex items-center gap-3"><FileSpreadsheet className="size-icon-lg text-dacfp-blue" aria-hidden="true" /><div><p className="eyebrow">Report scope</p><h2 id="report-scope-heading" className="text-xl font-bold text-dacfp-navy">Courses and completion dates</h2></div></div>
        <fieldset className="mt-6">
          <legend className="text-sm font-bold text-dacfp-navy">Courses</legend>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {reportCourses.map((course) => (
              <label key={course.id} className="flex min-h-12 items-start gap-3 rounded-lg border border-dacfp-line p-3">
                <input className="mt-0.5 size-5 accent-dacfp-maroon" type="checkbox" checked={courseIds.includes(course.id)} onChange={() => toggleCourse(course.id)} />
                <span><span className="block font-bold text-dacfp-navy">{course.title}</span><span className="block text-xs text-dacfp-gray-text">{course.cfp_program_id ? `Program ${course.cfp_program_id}` : 'CFP Program ID pending — tolerated, not exportable'}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-dacfp-navy">Period start<input className="mt-2 min-h-11 w-full rounded-lg border border-dacfp-line px-3 font-normal" type="date" value={periodStart} onChange={(event) => { setPeriodStart(event.target.value); setPreview(null); }} /></label>
          <label className="text-sm font-bold text-dacfp-navy">Period end<input className="mt-2 min-h-11 w-full rounded-lg border border-dacfp-line px-3 font-normal" type="date" value={periodEnd} onChange={(event) => { setPeriodEnd(event.target.value); setPreview(null); }} /></label>
        </div>
        <label className="mt-5 flex min-h-11 items-center gap-3 rounded-lg border border-dacfp-line p-3"><input className="size-5 accent-dacfp-maroon" type="checkbox" checked={includeAlreadyReported} onChange={(event) => { setIncludeAlreadyReported(event.target.checked); setPreview(null); }} /><span><span className="font-bold text-dacfp-navy">Include already-reported completions</span><span className="ml-2 text-sm text-dacfp-gray-text">Use only for corrections.</span></span></label>
        <div className="mt-5 flex flex-wrap gap-3"><button className="button-secondary" type="button" disabled={loading || courseIds.length === 0 || !periodStart || !periodEnd} onClick={() => void runPreview()}>{loading ? 'Loading…' : 'Preview report'}</button><button className="button-primary" type="button" disabled={loading || !preview?.reportable.length} onClick={() => void exportRun()}><Download className="size-icon-sm" aria-hidden="true" />Create and download .xlsx</button></div>
      </section>

      {preview ? (
        <div className="space-y-5">
          {preview.pending_program_courses.length ? <Alert tone="warning"><AlertTriangle className="mr-2 inline size-icon-sm" aria-hidden="true" />Program ID pending for {preview.pending_program_courses.map((course) => course.title).join(', ')}. Those completions are not exportable.</Alert> : null}
          <ScopeRows title="Reportable" rows={preview.reportable} tone="positive" />
          <ScopeRows title="Missing ID" rows={preview.missing_id} tone="warning" />
          <ScopeRows title="Already reported" rows={preview.already_reported} tone="neutral" />
        </div>
      ) : null}

      <section className="space-y-4" aria-labelledby="run-history-heading">
        <div className="flex items-center gap-3"><History className="size-icon-lg text-dacfp-blue" aria-hidden="true" /><div><p className="eyebrow">Retention record</p><h2 id="run-history-heading" className="text-xl font-bold text-dacfp-navy">Run history</h2></div></div>
        {runs.length ? <div className="card overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Created</TableHead><TableHead>Period</TableHead><TableHead>Rows</TableHead><TableHead>Filename</TableHead><TableHead>Download</TableHead></TableRow></TableHeader><TableBody>{runs.map((run) => <TableRow key={run.id}><TableCell>{new Date(run.created_at).toLocaleString()}</TableCell><TableCell>{run.period_start} – {run.period_end}</TableCell><TableCell>{run.row_count}</TableCell><TableCell className="font-mono text-xs">{run.filename}</TableCell><TableCell><button className="button-quiet" type="button" onClick={() => void downloadCfpCeWorkbook(run.rows, run.filename).catch(() => setError('The retained report could not be downloaded.'))}><Download className="size-icon-sm" aria-hidden="true" />Download again</button></TableCell></TableRow>)}</TableBody></Table></div></div> : <p className="card p-6 text-sm text-dacfp-gray-text">No CFP CE report runs have been recorded.</p>}
      </section>
    </div>
  );
}
