import {
  Award,
  ClipboardList,
  Download,
  FileUp,
  Plus,
  Printer,
  Search,
  StickyNote,
  UserPlus,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { CertificateArtwork } from '../components/CertificateArtwork';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DetailList, type DetailItem } from '../components/DetailList';
import { Field } from '../components/Field';
import { NamedConfirmDialog } from '../components/NamedConfirmDialog';
import { PageHeader, StatusPill, formatDate } from '../components/common';
import { useAdmin } from '../context/AdminContext';
import type {
  AuditSearchResult,
  DashboardData,
  DirectoryResult,
  ImportPreview,
  ImportResult,
  LearnerInspection,
} from '../data/admin';
import type { LmsLearnerProfile } from '../data/types';
import {
  addOneYear,
  inspectionToSnapshot,
  remainingRequirements,
} from '../lib/adminLearnerFile';
import { courseKind } from '../lib/courseKind';
import { parseLearnerImportCsv, LEARNER_IMPORT_HEADERS } from '../lib/learnerImportCsv';
import { blockerGuidance, courseProgressionBlocker } from '../lib/progress';
import { AuditTarget, EnrollmentInspector } from './AdminPages';

const selectClass =
  'min-h-11 w-full rounded-lg border border-input bg-transparent px-3.5 py-2 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm';

function downloadText(fileName: string, content: string, type = 'text/csv') {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([content], { type }));
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
}

function learnerFilePath(email: string) {
  return `/admin/learners/${encodeURIComponent(email)}`;
}

// ---------------------------------------------------------------------------
// §1 Operator dashboard — the admin landing page
// ---------------------------------------------------------------------------

interface TileSpec {
  key: keyof DashboardData;
  label: string;
  source: string;
  to: string;
}

/**
 * Every tile links to the §2 directory pre-filtered to exactly the population
 * it counts, and the count itself comes from the same lms_admin_list_learners
 * call the link will run — equal by construction (M1 §0; Absorb lesson #1:
 * the copy names the population and the object it derives from).
 */
const DASHBOARD_TILES: TileSpec[] = [
  { key: 'total_learners', label: 'Total learners', source: 'Learner accounts', to: '/admin/learners' },
  { key: 'active_access', label: 'With active enrollment', source: 'Learners · lms_enrollments', to: '/admin/learners?status=active' },
  { key: 'in_progress', label: 'In progress', source: 'Active, incomplete, with activity', to: '/admin/learners?in_progress=1' },
  { key: 'completed_30d', label: 'Completed · last 30 days', source: 'lms_completion_events', to: '/admin/learners?completed=1&within=30' },
  { key: 'completed_all', label: 'Completed · all time', source: 'lms_completion_events', to: '/admin/learners?completed=1' },
  { key: 'expiring_30', label: 'Expiring within 30 days', source: 'Active enrollments', to: '/admin/learners?expiring=30' },
  { key: 'expiring_60', label: 'Expiring within 60 days', source: 'Active enrollments', to: '/admin/learners?expiring=60' },
  { key: 'expiring_90', label: 'Expiring within 90 days', source: 'Active enrollments', to: '/admin/learners?expiring=90' },
  { key: 'stalled', label: 'Stalled learners', source: 'No progress activity in 14 days', to: '/admin/learners?stalled=1' },
  { key: 'deactivated', label: 'Deactivated accounts', source: 'Sign-in blocked', to: '/admin/learners?deactivated=1' },
];

export function AdminDashboardPage() {
  const { request } = useAdmin();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    request<DashboardData>('dashboard')
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setError('Dashboard counts could not be loaded.'); });
    return () => { cancelled = true; };
  }, [request]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operator dashboard"
        title="Learner operations"
        description="Every count is a live population from the canonical learner directory query. Click a tile to open that exact population."
        action={<Link className="button-secondary" to="/admin/import"><FileUp className="size-icon-sm" aria-hidden="true" />Bulk import</Link>}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {data ? (
        <>
          <section aria-label="Learner population tiles" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DASHBOARD_TILES.map((tile) => (
              <Link key={tile.key} className="card block p-5 transition-shadow hover:shadow-md" to={tile.to}>
                <p className="text-sm font-bold text-dacfp-gray-text">{tile.label}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-dacfp-navy">{String(data[tile.key])}</p>
                <p className="mt-2 text-xs text-dacfp-gray-text">{tile.source}</p>
              </Link>
            ))}
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card p-5 sm:p-6" aria-labelledby="recent-completions-heading">
              <h2 id="recent-completions-heading" className="text-xl font-bold text-dacfp-navy">Latest completions</h2>
              <p className="mt-1 text-sm text-dacfp-gray-text">From lms_completion_events, newest first.</p>
              {data.recent_completions.length ? (
                <ul className="mt-4 space-y-2">
                  {data.recent_completions.map((completion, index) => (
                    <li key={`${completion.person_email}-${index}`}>
                      <Link className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dacfp-line px-3 py-2 text-sm hover:bg-dacfp-wash" to={learnerFilePath(completion.person_email)}>
                        <span className="font-semibold text-dacfp-navy">{completion.person_email}</span>
                        <span className="text-dacfp-gray-text">{completion.course_title} · {formatDate(completion.completed_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-4 text-sm text-dacfp-gray-text">No completions recorded yet.</p>}
            </section>
            <section className="card p-5 sm:p-6" aria-labelledby="recent-actions-heading">
              <h2 id="recent-actions-heading" className="text-xl font-bold text-dacfp-navy">Latest admin actions</h2>
              <p className="mt-1 text-sm text-dacfp-gray-text">From lms_admin_actions, newest first.</p>
              {data.recent_actions.length ? (
                <ul className="mt-4 space-y-2">
                  {data.recent_actions.map((action, index) => {
                    const email = typeof action.target.email === 'string'
                      ? action.target.email
                      : typeof action.target.person_email === 'string'
                        ? action.target.person_email
                        : null;
                    const body = (
                      <>
                        <span className="font-semibold text-dacfp-navy">{action.action}</span>
                        <span className="text-dacfp-gray-text">{action.actor_email} · {formatDate(action.created_at)}</span>
                      </>
                    );
                    return (
                      <li key={`${action.created_at}-${index}`}>
                        {email ? (
                          <Link className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dacfp-line px-3 py-2 text-sm hover:bg-dacfp-wash" to={learnerFilePath(email)}>{body}</Link>
                        ) : (
                          <span className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dacfp-line px-3 py-2 text-sm">{body}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="mt-4 text-sm text-dacfp-gray-text">No admin actions recorded yet.</p>}
            </section>
          </div>
        </>
      ) : !error ? <p className="text-sm text-dacfp-gray-text" role="status">Loading dashboard…</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// §2 Learner directory
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

function payloadFromParams(params: URLSearchParams) {
  const page = Math.max(Number(params.get('page') ?? '1') || 1, 1);
  return {
    search: params.get('q') ?? undefined,
    course_id: params.get('course') ?? undefined,
    status: params.get('status') ?? undefined,
    stalled: params.get('stalled') === '1',
    expiring_days: params.get('expiring') ? Number(params.get('expiring')) : undefined,
    completed: params.get('completed') === '1',
    completed_within_days: params.get('within') ? Number(params.get('within')) : undefined,
    in_progress: params.get('in_progress') === '1',
    deactivated: params.get('deactivated') === '1',
    sort: params.get('sort') ?? 'email',
    dir: params.get('dir') ?? 'asc',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
}

const SORTS: Array<{ key: string; label: string }> = [
  { key: 'email', label: 'Email' },
  { key: 'progress', label: 'Progress' },
  { key: 'expiration', label: 'Expiration' },
  { key: 'last_activity', label: 'Last activity' },
];

export function AdminDirectoryPage() {
  const { catalog, request } = useAdmin();
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState<DirectoryResult | null>(null);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState(params.get('q') ?? '');
  const page = Math.max(Number(params.get('page') ?? '1') || 1, 1);

  const load = useCallback(() => {
    setError('');
    request<DirectoryResult>('list_learners', payloadFromParams(params))
      .then(setResult)
      .catch(() => setError('The learner directory could not be loaded.'));
  }, [params, request]);

  useEffect(() => { load(); }, [load]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const toggleSort = (key: string) => {
    const current = params.get('sort') ?? 'email';
    const dir = params.get('dir') ?? 'asc';
    const next = new URLSearchParams(params);
    next.set('sort', key);
    next.set('dir', current === key && dir === 'asc' ? 'desc' : 'asc');
    next.delete('page');
    setParams(next);
  };

  const exportCsv = async () => {
    setError('');
    try {
      const { limit: _limit, offset: _offset, ...filters } = payloadFromParams(params);
      const exported = await request<{ file_name: string; csv: string; row_count: number }>(
        'export_learners_csv',
        filters,
      );
      downloadText(exported.file_name, exported.csv);
    } catch {
      setError('The directory CSV could not be exported.');
    }
  };

  const chips: Array<{ key: string; label: string }> = [
    { key: 'stalled', label: `Stalled (${result?.stalled_threshold_days ?? 14}d)` },
    { key: 'in_progress', label: 'In progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'deactivated', label: 'Deactivated' },
  ];
  const totalPages = result ? Math.max(Math.ceil(result.total / PAGE_SIZE), 1) : 1;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Learner management"
        title="Learner directory"
        description="Every learner account, with enrollment, progress, and expiration state from the canonical directory query."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link className="button-quiet" to="/admin/learners/inspect"><Search className="size-icon-sm" aria-hidden="true" />Single-email inspector</Link>
            <Link className="button-secondary" to="/admin/import"><FileUp className="size-icon-sm" aria-hidden="true" />Bulk import</Link>
            <CreateLearnerDialog />
          </div>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <section className="card space-y-4 p-5" aria-label="Directory filters">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => { event.preventDefault(); setParam('q', searchDraft.trim() || null); }}
        >
          <Input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search email or name" aria-label="Search email or name" />
          <button className="button-secondary shrink-0" type="submit"><Search className="size-icon-sm" aria-hidden="true" />Search</button>
        </form>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Course">
            <select className={selectClass} value={params.get('course') ?? ''} onChange={(event) => setParam('course', event.target.value || null)}>
              <option value="">All courses</option>
              {catalog.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </Field>
          <Field label="Enrollment status">
            <select className={selectClass} value={params.get('status') ?? ''} onChange={(event) => setParam('status', event.target.value || null)}>
              <option value="">Any</option>
              <option value="active">Active</option>
              <option value="expired">Expired / revoked</option>
              <option value="none">No enrollment</option>
            </select>
          </Field>
          <Field label="Expiring within">
            <select className={selectClass} value={params.get('expiring') ?? ''} onChange={(event) => setParam('expiring', event.target.value || null)}>
              <option value="">Any expiry</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Population filters">
          {chips.map((chip) => {
            const active = params.get(chip.key) === '1';
            return (
              <button
                key={chip.key}
                type="button"
                aria-pressed={active}
                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-bold transition-colors ${active ? 'border-dacfp-navy bg-dacfp-navy text-white' : 'border-dacfp-line text-dacfp-gray-text hover:bg-dacfp-wash'}`}
                onClick={() => setParam(chip.key, active ? null : '1')}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Learner directory results">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-dacfp-gray-text" role="status">
            {result ? `${result.total} learner${result.total === 1 ? '' : 's'} match the current filters.` : 'Loading learners…'}
          </p>
          <button className="button-secondary" onClick={() => void exportCsv()} type="button">
            <Download className="size-icon-sm" aria-hidden="true" />Export filtered CSV
          </button>
        </div>

        <div className="mt-4 hidden md:block">
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {SORTS.map((sort) => (
                      <TableHead key={sort.key}>
                        <button className="font-bold text-dacfp-navy hover:underline" type="button" onClick={() => toggleSort(sort.key)}>
                          {sort.label}{(params.get('sort') ?? 'email') === sort.key ? ((params.get('dir') ?? 'asc') === 'asc' ? ' ↑' : ' ↓') : ''}
                        </button>
                      </TableHead>
                    ))}
                    <TableHead>Course</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(result?.rows ?? []).map((row) => (
                    <TableRow key={row.auth_user_id}>
                      <TableCell>
                        <Link className="font-semibold text-dacfp-navy hover:underline" to={learnerFilePath(row.email)}>{row.email}</Link>
                        <p className="text-xs text-dacfp-gray-text">{[row.first_name, row.last_name].filter(Boolean).join(' ') || row.display_name}</p>
                      </TableCell>
                      <TableCell className="tabular-nums">{row.percent_complete === null ? '—' : `${row.percent_complete}%`}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.expires_at ? formatDate(row.expires_at) : '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.last_activity ? formatDate(row.last_activity) : '—'}</TableCell>
                      <TableCell>{row.course_title ?? '—'}{row.enrollment_count > 1 ? ` +${row.enrollment_count - 1}` : ''}</TableCell>
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          <StatusPill tone={row.enrollment_status === 'active' ? 'positive' : row.enrollment_status === 'none' ? 'muted' : 'warning'}>{row.enrollment_status}</StatusPill>
                          {row.deactivated ? <StatusPill tone="warning">deactivated</StatusPill> : null}
                          {row.stalled ? <StatusPill tone="current">stalled</StatusPill> : null}
                          {row.completed ? <StatusPill tone="positive">completed</StatusPill> : null}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <ul className="mt-4 space-y-3 md:hidden">
          {(result?.rows ?? []).map((row) => (
            <li key={row.auth_user_id} className="card p-4">
              <Link className="font-semibold text-dacfp-navy hover:underline" to={learnerFilePath(row.email)}>{row.email}</Link>
              <p className="mt-1 text-sm text-dacfp-gray-text">{row.course_title ?? 'No enrollment'} · {row.percent_complete === null ? '—' : `${row.percent_complete}%`} · {row.expires_at ? formatDate(row.expires_at) : 'no expiry'}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <StatusPill tone={row.enrollment_status === 'active' ? 'positive' : row.enrollment_status === 'none' ? 'muted' : 'warning'}>{row.enrollment_status}</StatusPill>
                {row.deactivated ? <StatusPill tone="warning">deactivated</StatusPill> : null}
                {row.stalled ? <StatusPill tone="current">stalled</StatusPill> : null}
              </div>
            </li>
          ))}
        </ul>

        <nav className="mt-4 flex items-center justify-between" aria-label="Directory pages">
          <button className="button-quiet" disabled={page <= 1} type="button" onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set('page', String(page - 1)); return next; })}>← Previous</button>
          <p className="text-sm tabular-nums text-dacfp-gray-text">Page {page} of {totalPages}</p>
          <button className="button-quiet" disabled={page >= totalPages} type="button" onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set('page', String(page + 1)); return next; })}>Next →</button>
        </nav>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// §4 Create learner
// ---------------------------------------------------------------------------

function CreateLearnerDialog() {
  const { mutate } = useAdmin();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    const values = new FormData(event.currentTarget);
    const email = String(values.get('email') ?? '').trim().toLowerCase();
    try {
      await mutate('create_learner', {
        email,
        first_name: values.get('first_name'),
        middle_name: values.get('middle_name'),
        last_name: values.get('last_name'),
        cfp_id: values.get('cfp_id'),
      });
      setOpen(false);
      navigate(learnerFilePath(email));
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : 'Learner could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="button-primary" type="button"><UserPlus className="size-icon-sm" aria-hidden="true" />Create learner</button>
      </DialogTrigger>
      <DialogContent className="rounded-card border-dacfp-line">
        <DialogHeader>
          <DialogTitle className="font-sans text-lg font-bold text-dacfp-navy">Create a learner account</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-dacfp-gray-text">
            No password is set or shown here — the learner sets their own through the password reset flow.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(event) => void create(event)}>
          <Field label="Email"><Input name="email" type="email" required /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="First name"><Input name="first_name" required /></Field>
            <Field label="Middle name"><Input name="middle_name" /></Field>
            <Field label="Last name"><Input name="last_name" required /></Field>
          </div>
          <Field label="CFP Board ID" hint="Optional — used by CFP CE reporting."><Input name="cfp_id" /></Field>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <button className="button-primary" disabled={saving} type="submit">{saving ? 'Creating…' : 'Create learner'}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// §3 Learner file
// ---------------------------------------------------------------------------

function CertificateDialog({
  profile,
  courseTitle,
  completionDate,
  expirationDate,
}: {
  profile: LmsLearnerProfile;
  courseTitle: string;
  completionDate: string;
  expirationDate: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="button-secondary" type="button"><Award className="size-icon-sm" aria-hidden="true" />View certificate</button>
      </DialogTrigger>
      <DialogContent className="certificate-page max-h-[90dvh] max-w-4xl overflow-y-auto rounded-card border-dacfp-line">
        <DialogHeader>
          <DialogTitle className="font-sans text-lg font-bold text-dacfp-navy">{courseTitle} certificate</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-dacfp-gray-text">
            The same C1 artifact the learner sees, derived from the completion record.
          </DialogDescription>
        </DialogHeader>
        <div className="certificate-stage">
          <CertificateArtwork profile={profile} completionDate={completionDate} expirationDate={expirationDate} />
        </div>
        <div className="certificate-actions flex justify-end">
          <button className="button-primary" type="button" onClick={() => window.print()}>
            <Printer className="size-icon-sm" aria-hidden="true" /> Download / print
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActionRailButton({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function AdminLearnerFilePage() {
  const { email: emailParam } = useParams();
  const email = decodeURIComponent(emailParam ?? '').toLowerCase();
  const { catalog, inspectLearner, mutate, request } = useAdmin();
  const navigate = useNavigate();
  const [inspection, setInspection] = useState<LearnerInspection | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    try {
      setInspection(await inspectLearner(email));
    } catch {
      setError('The learner file could not be loaded.');
    }
  }, [email, inspectLearner]);

  useEffect(() => { setInspection(undefined); setError(''); void reload(); }, [reload]);

  const act = async (action: string, payload: Record<string, unknown>, done: string) => {
    setError(''); setNotice('');
    try {
      await mutate(action, payload);
    } catch {
      setError(`${action.replaceAll('_', ' ')} failed. No change was confirmed.`);
      return false;
    }
    setNotice(done);
    await reload().catch(() => undefined);
    return true;
  };

  if (inspection === undefined && !error) {
    return <p className="text-sm text-dacfp-gray-text" role="status">Loading learner file…</p>;
  }
  if (inspection === null) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Learner file" title="No learner found" description={`No account exists for ${email}.`} />
        <Link className="button-secondary" to="/admin/learners">Back to directory</Link>
      </div>
    );
  }
  if (!inspection) return <Alert tone="danger">{error}</Alert>;

  const snapshot = inspectionToSnapshot(inspection);
  const profileForCertificate = snapshot.profile;
  const fullName = [
    inspection.profile?.first_name,
    inspection.profile?.middle_name,
    inspection.profile?.last_name,
  ].filter(Boolean).join(' ') || inspection.profile?.display_name || email;
  const completionByEnrollment = new Map(
    inspection.completions.map((completion) => [completion.enrollment_id, completion]),
  );
  const reported = new Set(inspection.ceReportedCompletionIds);
  const hasCompletions = inspection.completions.length > 0;
  const enrolledCourseIds = new Set(inspection.enrollments.map((item) => item.course_id));
  const grantableCourses = catalog.courses.filter((course) => !enrolledCourseIds.has(course.id));
  const defaultExpiry = addOneYear(new Date().toISOString()).slice(0, 10);

  const headerFacts: DetailItem[] = [
    { label: 'Email', value: inspection.user.email, mono: true },
    { label: 'Full name', value: fullName },
    { label: 'CFP Board ID', value: inspection.profile?.credential_ids?.cfp ?? null, mono: true },
    { label: 'Account created', value: inspection.account.created_at ? formatDate(inspection.account.created_at) : null },
    { label: 'Account state', value: inspection.account.deactivated ? 'Deactivated (sign-in blocked)' : 'Active' },
    { label: 'Enrollments', value: inspection.enrollments.length },
  ];

  return (
    <div className="space-y-8">
      <Link className="button-quiet" to="/admin/learners">← Learner directory</Link>
      <PageHeader
        eyebrow="Learner file"
        title={fullName}
        description={inspection.user.email}
        action={inspection.account.deactivated
          ? <StatusPill tone="warning">Deactivated</StatusPill>
          : <StatusPill tone="positive">Active account</StatusPill>}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="positive">{notice}</Alert> : null}

      <section className="card p-5 sm:p-6" aria-labelledby="identity-heading">
        <h2 id="identity-heading" className="text-xl font-bold text-dacfp-navy">Identity</h2>
        <div className="mt-4"><DetailList items={headerFacts} /></div>
      </section>

      {/* Action rail — §4 account actions + §5 grant */}
      <section className="card p-5 sm:p-6" aria-labelledby="action-rail-heading">
        <h2 id="action-rail-heading" className="text-xl font-bold text-dacfp-navy">Actions</h2>
        <p className="mt-1 text-sm text-dacfp-gray-text">Every action is operator-gated and writes one audit row. Course access only — designation status is governed elsewhere and never changed here.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionRailButton><EditProfileDialog inspection={inspection} onSave={act} /></ActionRailButton>
          <ConfirmDialog
            trigger={<button className="button-secondary" type="button">Send password reset</button>}
            title="Send a password reset email?"
            description={`A reset email will be dispatched to ${inspection.user.email}. No token or link is shown here.`}
            confirmLabel="Send reset email"
            onConfirm={() => void act('send_password_reset', { email: inspection.user.email }, `Password reset dispatched to ${inspection.user.email}.`)}
          />
          {inspection.account.deactivated ? (
            <ConfirmDialog
              trigger={<button className="button-secondary" type="button">Reactivate account</button>}
              title="Reactivate this account?"
              description={`${inspection.user.email} will be able to sign in again immediately.`}
              confirmLabel="Reactivate"
              onConfirm={() => void act('reactivate_learner', { auth_user_id: inspection.user.id }, 'Account reactivated.')}
            />
          ) : (
            <NamedConfirmDialog
              trigger={<button className="button-secondary text-status-danger" type="button">Deactivate account</button>}
              title="Deactivate this account?"
              description="Deactivation blocks sign-in. It deletes nothing, the learner stays fully visible here, and it is reversible at any time."
              confirmLabel="Deactivate"
              expected={inspection.user.email}
              onConfirm={() => void act('deactivate_learner', { auth_user_id: inspection.user.id }, 'Account deactivated. Sign-in is blocked.')}
            />
          )}
          {grantableCourses.length ? <GrantEnrollmentDialog email={inspection.user.email} courses={grantableCourses} defaultExpiry={defaultExpiry} onSave={act} /> : null}
          {hasCompletions ? (
            <ConfirmDialog
              trigger={<button className="button-secondary text-status-danger" type="button">Delete learner</button>}
              title="Deletion is not available"
              description="This learner has completion (or CE reporting) records, which are permanent. Deactivate the account instead — it blocks sign-in, deletes nothing, and is reversible."
              confirmLabel="Understood"
              onConfirm={() => undefined}
            />
          ) : (
            <NamedConfirmDialog
              trigger={<button className="button-secondary text-status-danger" type="button">Delete learner</button>}
              title="Permanently delete this learner?"
              description="Allowed only because this learner has zero completion events and zero CE report inclusion. The account, profile, enrollments, progress, attempts, survey responses, and notes are removed following the platform FK graph. This cannot be undone."
              confirmLabel="Delete learner"
              expected={inspection.user.email}
              onConfirm={async () => {
                const ok = await act('delete_learner', { auth_user_id: inspection.user.id, confirm_email: inspection.user.email }, 'Learner deleted.');
                if (ok) navigate('/admin/learners');
              }}
            />
          )}
        </div>
      </section>

      {/* §3 completion & certificate panel */}
      <section className="card p-5 sm:p-6" aria-labelledby="completion-heading">
        <h2 id="completion-heading" className="text-xl font-bold text-dacfp-navy">Completion &amp; certificate</h2>
        <p className="mt-1 text-sm text-dacfp-gray-text">Certificates derive from completion records only, and only the FPT completion issues one. No completion record — no certificate, anywhere.</p>
        <div className="mt-4 space-y-4">
          {inspection.enrollments.map((enrollment) => {
            const completion = completionByEnrollment.get(enrollment.id);
            const course = catalog.courses.find((item) => item.id === enrollment.course_id);
            if (completion) {
              // Ratified M1 decision: only the FPT (flagship) completion has a
              // certificate. Renewal completions extend the FPT certificate
              // dates per C1-SPEC (renewal certificates are out of C1 scope);
              // bonus completions carry no certificate affordance at all.
              const isFlagship = course ? courseKind(course) === 'flagship' : false;
              return (
                <article key={enrollment.id} className="rounded-lg border border-dacfp-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-dacfp-navy">{enrollment.lms_courses.title}</h3>
                      <p className="mt-1 text-sm text-dacfp-gray-text">
                        Completed {formatDate(completion.completed_at)} ({completion.trigger === 'manual_admin' ? 'manual admin action' : 'all requirements met'})
                        {isFlagship ? ` · certificate valid through ${formatDate(addOneYear(completion.completed_at))}` : ''}
                      </p>
                      {!isFlagship ? (
                        <p className="mt-1 text-sm text-dacfp-gray-text">
                          Completion recorded — this course does not issue its own certificate.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={reported.has(completion.id) ? 'positive' : 'neutral'}>
                        {reported.has(completion.id) ? 'Included in a CE report' : 'Not yet CE reported'}
                      </StatusPill>
                      {isFlagship ? (
                        <CertificateDialog
                          profile={profileForCertificate}
                          courseTitle={enrollment.lms_courses.title}
                          completionDate={formatDate(completion.completed_at)}
                          expirationDate={formatDate(addOneYear(completion.completed_at))}
                        />
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            }
            if (!course) return null;
            const incompleteFlagship = courseKind(course) === 'flagship';
            const blocker = courseProgressionBlocker(catalog, snapshot, course);
            const remaining = remainingRequirements(catalog, snapshot, course);
            const guidance = blocker ? blockerGuidance(blocker, null) : null;
            return (
              <article key={enrollment.id} className="rounded-lg border border-dashed border-dacfp-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-dacfp-navy">{enrollment.lms_courses.title}</h3>
                    <p className="mt-1 text-sm text-dacfp-gray-text">
                      {incompleteFlagship
                        ? 'No completion record — no certificate exists for this course.'
                        : 'No completion record. This course does not issue its own certificate.'}
                    </p>
                  </div>
                  <ConfirmDialog
                    trigger={<button className="button-secondary" type="button">Manual mark complete</button>}
                    title={`Mark ${enrollment.lms_courses.title} complete?`}
                    description={incompleteFlagship
                      ? 'This records an audited manual completion event. The certificate derives from it and becomes live immediately. Course access only — this does not issue or alter any designation.'
                      : 'This records an audited manual completion event. This course does not issue its own certificate. Course access only — this does not issue or alter any designation.'}
                    confirmLabel="Mark complete"
                    onConfirm={() => void act('manual_mark_complete', { enrollment_id: enrollment.id }, incompleteFlagship ? 'Completion recorded. The certificate is now live.' : 'Completion recorded.')}
                  />
                </div>
                {guidance ? (
                  <p className="mt-3 rounded-lg bg-dacfp-wash p-3 text-sm text-dacfp-navy"><strong>Next blocker (as the learner sees it):</strong> {guidance.message}</p>
                ) : course.progression !== 'sequential' ? (
                  <p className="mt-3 text-sm text-dacfp-gray-text">Open-progression course — requirements below can be completed in any order.</p>
                ) : null}
                {remaining.length ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-bold text-dacfp-navy">Remaining requirements</p>
                    <ul className="space-y-1 text-sm text-dacfp-gray-text">
                      {remaining.map((entry) => (
                        <li key={entry.module.id}>
                          <span className="font-semibold text-dacfp-navy">{entry.module.position === 0 ? 'Introduction' : `Module ${entry.module.position}`}:</span>{' '}
                          {[...entry.lessons.map((lesson) => `${lesson.title}${lesson.kind === 'survey' ? ' (survey)' : ''}`), ...(entry.quiz ? ['pass the module quiz'] : [])].join(' · ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : <p className="mt-3 text-sm text-dacfp-gray-text">All requirements appear complete — the completion detector will fire on the learner's next progression write, or use manual mark complete.</p>}
              </article>
            );
          })}
          {inspection.enrollments.length === 0 ? (
            <p className="text-sm text-dacfp-gray-text">No enrollments. Grant one from the actions above to begin.</p>
          ) : null}
        </div>
      </section>

      {/* Enrollment panels with §5/§6 controls */}
      <section className="space-y-6" aria-label="Enrollments">
        {inspection.enrollments.map((enrollment) => (
          <div key={enrollment.id} className="space-y-3">
            <EnrollmentInspector
              inspection={inspection}
              enrollment={enrollment}
              onSupport={async (action, payload) => { await act(action, payload, `${action.replaceAll('_', ' ')} completed.`); }}
            />
            <EnrollmentActions enrollment={enrollment} email={inspection.user.email} onAct={act} />
          </div>
        ))}
      </section>

      {/* Support notes */}
      <section className="card p-5 sm:p-6" aria-labelledby="notes-heading">
        <h2 id="notes-heading" className="text-xl font-bold text-dacfp-navy"><StickyNote className="mr-2 inline size-icon-md" aria-hidden="true" />Support notes</h2>
        <p className="mt-1 text-sm text-dacfp-gray-text">Append-only. Notes cannot be edited or deleted.</p>
        <AddNoteForm authUserId={inspection.user.id} onAct={act} />
        {inspection.notes.length ? (
          <ul className="mt-4 space-y-3">
            {inspection.notes.map((note) => (
              <li key={note.id} className="rounded-lg border border-dacfp-line p-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-dacfp-navy">{note.body}</p>
                <p className="mt-2 text-xs text-dacfp-gray-text">{note.author_email} · {new Date(note.created_at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-dacfp-gray-text">No notes yet.</p>}
      </section>

      {/* Audit slice */}
      <section className="card p-5 sm:p-6" aria-labelledby="audit-slice-heading">
        <h2 id="audit-slice-heading" className="text-xl font-bold text-dacfp-navy"><ClipboardList className="mr-2 inline size-icon-md" aria-hidden="true" />Audit trail for this learner</h2>
        <p className="mt-1 text-sm text-dacfp-gray-text">{inspection.auditSlice.total} action{inspection.auditSlice.total === 1 ? '' : 's'} where this learner is the target, newest first.</p>
        {inspection.auditSlice.rows.length ? (
          <ul className="mt-4 space-y-2">
            {inspection.auditSlice.rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-dacfp-line px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-dacfp-navy">{row.action}</span>
                  <span className="text-xs text-dacfp-gray-text">{row.actor_email} · {new Date(row.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-1"><AuditTarget target={row.target} /></div>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-dacfp-gray-text">No audited actions target this learner yet.</p>}
      </section>
    </div>
  );
}

function EditProfileDialog({
  inspection,
  onSave,
}: {
  inspection: LearnerInspection;
  onSave: (action: string, payload: Record<string, unknown>, done: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="button-secondary" type="button">Edit profile</button>
      </DialogTrigger>
      <DialogContent className="rounded-card border-dacfp-line">
        <DialogHeader>
          <DialogTitle className="font-sans text-lg font-bold text-dacfp-navy">Edit profile fields</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-dacfp-gray-text">
            First, middle, last, and CFP Board ID. Email change is out of scope for M1.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            void onSave('update_learner_profile', {
              auth_user_id: inspection.user.id,
              first_name: values.get('first_name'),
              middle_name: values.get('middle_name'),
              last_name: values.get('last_name'),
              cfp_id: values.get('cfp_id'),
            }, 'Profile updated.').then((ok) => { if (ok) setOpen(false); });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="First name"><Input name="first_name" defaultValue={inspection.profile?.first_name ?? ''} required /></Field>
            <Field label="Middle name"><Input name="middle_name" defaultValue={inspection.profile?.middle_name ?? ''} /></Field>
            <Field label="Last name"><Input name="last_name" defaultValue={inspection.profile?.last_name ?? ''} required /></Field>
          </div>
          <Field label="CFP Board ID"><Input name="cfp_id" defaultValue={inspection.profile?.credential_ids?.cfp ?? ''} /></Field>
          <button className="button-primary" type="submit">Save profile</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GrantEnrollmentDialog({
  email,
  courses,
  defaultExpiry,
  onSave,
}: {
  email: string;
  courses: Array<{ id: string; slug: string; title: string }>;
  defaultExpiry: string;
  onSave: (action: string, payload: Record<string, unknown>, done: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="button-secondary" type="button"><Plus className="size-icon-sm" aria-hidden="true" />Grant enrollment</button>
      </DialogTrigger>
      <DialogContent className="rounded-card border-dacfp-line">
        <DialogHeader>
          <DialogTitle className="font-sans text-lg font-bold text-dacfp-navy">Grant an enrollment</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-dacfp-gray-text">
            Uses the same grant path the launch webhook will use. Granting the flagship course also provisions its bonus-course enrollments (locked until it is completed).
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            void onSave('grant_enrollment', {
              email,
              course_slug: values.get('course_slug'),
              expires_at: values.get('expires_at'),
            }, 'Enrollment granted.').then((ok) => { if (ok) setOpen(false); });
          }}
        >
          <Field label="Course">
            <select className={selectClass} name="course_slug" required defaultValue="">
              <option value="" disabled>Choose a course</option>
              {courses.map((course) => <option key={course.id} value={course.slug}>{course.title}</option>)}
            </select>
          </Field>
          <Field label="Access expires" hint="Defaults to one year from today.">
            <Input name="expires_at" type="date" defaultValue={defaultExpiry} required />
          </Field>
          <button className="button-primary" type="submit">Grant enrollment</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EnrollmentActions({
  enrollment,
  email,
  onAct,
}: {
  enrollment: LearnerInspection['enrollments'][number];
  email: string;
  onAct: (action: string, payload: Record<string, unknown>, done: string) => Promise<boolean>;
}) {
  const { catalog } = useAdmin();
  const [expiry, setExpiry] = useState(enrollment.expires_at ? enrollment.expires_at.slice(0, 10) : '');
  const [lessonId, setLessonId] = useState('');
  const moduleById = new Map(
    catalog.modules.filter((item) => item.course_id === enrollment.course_id).map((item) => [item.id, item]),
  );
  const courseLessons = catalog.lessons
    .filter((lesson) => moduleById.has(lesson.module_id) && lesson.kind !== 'survey')
    .sort((left, right) => {
      const moduleDiff = (moduleById.get(left.module_id)?.position ?? 0) - (moduleById.get(right.module_id)?.position ?? 0);
      return moduleDiff || left.position - right.position;
    });
  const revoked = enrollment.status === 'revoked';

  return (
    <div className="card space-y-4 p-5" aria-label={`${enrollment.lms_courses.title} enrollment actions`}>
      <h4 className="font-bold text-dacfp-navy">Enrollment actions · {enrollment.lms_courses.title}</h4>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* §5 set / extend expiration — two-clock copy: access expires; the
            designation is governed elsewhere. */}
        <form
          className="rounded-lg border border-dacfp-line p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!expiry) return;
            void onAct('set_enrollment_expiration', { enrollment_id: enrollment.id, expires_at: expiry }, 'Expiration updated.');
          }}
        >
          <p className="text-sm font-bold text-dacfp-navy">Set / extend course access expiration</p>
          <p className="mt-1 text-xs text-dacfp-gray-text">Current: {enrollment.expires_at ? formatDate(enrollment.expires_at) : 'no expiry set'}. Course access only — the CBDA designation clock is governed separately and is not changed by this.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input aria-label="New expiration date" type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} required />
            <button className="button-secondary shrink-0" type="submit">Save expiration</button>
          </div>
        </form>
        {/* §6 single-lesson completion through the engine path */}
        <div className="rounded-lg border border-dacfp-line p-4">
          <p className="text-sm font-bold text-dacfp-navy">Mark a single lesson complete</p>
          <p className="mt-1 text-xs text-dacfp-gray-text">Support path for playback or tracking failures. Writes through the progression engine so downstream unlocks stay consistent; video positions are never fabricated. Surveys are excluded — they complete only by learner submission.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select className={selectClass} aria-label="Lesson to mark complete" value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
              <option value="">Choose a lesson</option>
              {courseLessons.map((lesson) => {
                const module = moduleById.get(lesson.module_id);
                return (
                  <option key={lesson.id} value={lesson.id}>
                    {module?.position === 0 ? 'Intro' : `M${module?.position}`} · {lesson.title} ({lesson.kind})
                  </option>
                );
              })}
            </select>
            <ConfirmDialog
              trigger={<button className="button-secondary shrink-0" disabled={!lessonId} type="button">Mark complete</button>}
              title="Mark this lesson complete?"
              description="Records an audited completion for this lesson only, then re-runs the progression engine. If this was the last requirement, the course completion event fires."
              confirmLabel="Mark lesson complete"
              onConfirm={() => void onAct('admin_complete_lesson', { enrollment_id: enrollment.id, lesson_id: lessonId, }, 'Lesson marked complete through the engine path.')}
            />
          </div>
        </div>
      </div>
      {!revoked ? (
        <NamedConfirmDialog
          trigger={<button className="button-secondary text-status-danger" type="button">Revoke access</button>}
          title={`Revoke access to ${enrollment.lms_courses.title}?`}
          description="Ends this enrollment now (expired-now semantics). Progress history is never deleted, and access can be restored later by setting a new expiration."
          confirmLabel="Revoke access"
          expected={email}
          onConfirm={() => void onAct('revoke_enrollment', { enrollment_id: enrollment.id }, 'Access revoked.')}
        />
      ) : (
        <p className="text-sm text-dacfp-gray-text">Access is revoked. Set a future expiration above to restore it.</p>
      )}
    </div>
  );
}

function AddNoteForm({
  authUserId,
  onAct,
}: {
  authUserId: string;
  onAct: (action: string, payload: Record<string, unknown>, done: string) => Promise<boolean>;
}) {
  const [body, setBody] = useState('');
  return (
    <form
      className="mt-4 flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        if (!body.trim()) return;
        void onAct('add_learner_note', { auth_user_id: authUserId, body }, 'Note added.')
          .then((ok) => { if (ok) setBody(''); });
      }}
    >
      <Textarea className="min-h-20" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a support note (append-only, stamped with your email)" aria-label="New support note" required />
      <button className="button-secondary shrink-0 self-start" type="submit">Add note</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// §7 Bulk import
// ---------------------------------------------------------------------------

export function AdminImportPage() {
  const { mutate, request } = useAdmin();
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const parseRows = () => {
    const parsed = parseLearnerImportCsv(csvText);
    return parsed.map((row) => ({ ...row }));
  };

  const dryRun = async () => {
    setBusy(true); setError(''); setResult(null); setPreview(null);
    try {
      const rows = parseRows();
      setPreview(await request<ImportPreview>('import_learners', { rows, commit: false }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Dry run failed.');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true); setError('');
    try {
      const rows = parseRows();
      setResult(await mutate<ImportResult>('import_learners', { rows, commit: true }));
      setPreview(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Import failed. No commit was confirmed.');
    } finally {
      setBusy(false);
    }
  };

  const rejectionTable = (rejections: Array<{ row_number: number; field: string; reason: string }>) => (
    rejections.length ? (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow><TableHead>CSV row</TableHead><TableHead>Field</TableHead><TableHead>Reason</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {rejections.map((rejection, index) => (
                <TableRow key={`${rejection.row_number}-${index}`}>
                  <TableCell className="tabular-nums">{rejection.row_number}</TableCell>
                  <TableCell className="font-mono text-xs">{rejection.field}</TableCell>
                  <TableCell>{rejection.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    ) : null
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Launch operations"
        title="Bulk learner import"
        description={`CSV columns, exactly: ${LEARNER_IMPORT_HEADERS.join(', ')}. Idempotent by email — existing accounts are matched, never duplicated; conflicting rows become named rejections, not writes.`}
      />
      <section className="card space-y-4 p-5 sm:p-6" aria-label="Import input">
        <Field label="CSV file">
          <Input accept=".csv,text/csv" className="py-2" type="file" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void file.text().then(setCsvText).catch(() => setError('The CSV file could not be read.'));
          }} />
        </Field>
        <Field label="Or paste CSV content">
          <Textarea className="min-h-40 font-mono text-sm" value={csvText} onChange={(event) => setCsvText(event.target.value)} />
        </Field>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex flex-wrap gap-3">
          <button className="button-secondary" disabled={busy || !csvText.trim()} type="button" onClick={() => void dryRun()}>
            {busy ? 'Working…' : 'Dry-run preview'}
          </button>
          {preview ? (
            <ConfirmDialog
              trigger={<button className="button-primary" disabled={busy} type="button"><FileUp className="size-icon-sm" aria-hidden="true" />Commit {preview.valid_count} row{preview.valid_count === 1 ? '' : 's'}</button>}
              title={`Commit ${preview.valid_count} import row${preview.valid_count === 1 ? '' : 's'}?`}
              description={`${preview.valid_count} valid row${preview.valid_count === 1 ? '' : 's'} will create accounts (§4 semantics) and enrollments (§5 semantics). ${preview.rejected_count} rejected row${preview.rejected_count === 1 ? '' : 's'} will be skipped. Every write is audited.`}
              confirmLabel="Commit import"
              onConfirm={() => void commit()}
            />
          ) : null}
        </div>
      </section>

      {preview ? (
        <section className="space-y-4" aria-label="Dry-run preview">
          <Alert tone={preview.rejected_count ? 'warning' : 'positive'}>
            Dry run: {preview.valid_count} valid row{preview.valid_count === 1 ? '' : 's'}, {preview.rejected_count} named rejection{preview.rejected_count === 1 ? '' : 's'}. Nothing has been written.
          </Alert>
          {preview.valid_rows.length ? (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>CSV row</TableHead><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Course</TableHead><TableHead>Expiration</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.valid_rows.map((row) => (
                      <TableRow key={row.row_number}>
                        <TableCell className="tabular-nums">{row.row_number}</TableCell>
                        <TableCell className="font-mono text-xs">{row.email}</TableCell>
                        <TableCell>{[row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ')}</TableCell>
                        <TableCell>{row.course}</TableCell>
                        <TableCell className="tabular-nums">{row.expiration}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          {rejectionTable(preview.rejections)}
        </section>
      ) : null}

      {result ? (
        <section className="space-y-4" aria-label="Import result">
          <Alert tone="positive">
            Import committed: {result.accounts_created} account{result.accounts_created === 1 ? '' : 's'} created, {result.enrollments_created} enrollment{result.enrollments_created === 1 ? '' : 's'} granted, {result.rejections.length} rejection{result.rejections.length === 1 ? '' : 's'}.
          </Alert>
          {result.results.length ? (
            <ul className="card divide-y divide-dacfp-line">
              {result.results.map((row) => (
                <li key={row.row_number} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                  <Link className="font-mono text-xs text-dacfp-navy hover:underline" to={learnerFilePath(row.email)}>{row.email}</Link>
                  <span className="text-xs text-dacfp-gray-text">row {row.row_number}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {rejectionTable(result.rejections)}
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// §8 Audit trail search
// ---------------------------------------------------------------------------

const AUDIT_PAGE_SIZE = 50;

export function AdminAuditSearchPage() {
  const { audit, request } = useAdmin();
  const [actorEmail, setActorEmail] = useState('');
  const [action, setAction] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditSearchResult | null>(null);
  const [error, setError] = useState('');

  const knownActions = useMemo(
    () => [...new Set(audit.map((row) => row.action))].sort(),
    [audit],
  );

  const load = useCallback((toPage: number) => {
    setError('');
    request<AuditSearchResult>('search_audit', {
      actor_email: actorEmail || undefined,
      action: action || undefined,
      target_email: targetEmail || undefined,
      limit: AUDIT_PAGE_SIZE,
      offset: (toPage - 1) * AUDIT_PAGE_SIZE,
    })
      .then((data) => { setResult(data); setPage(toPage); })
      .catch(() => setError('The audit trail could not be searched.'));
  }, [action, actorEmail, request, targetEmail]);

  useEffect(() => { load(1); // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = result ? Math.max(Math.ceil(result.total / AUDIT_PAGE_SIZE), 1) : 1;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Accountability"
        title="Admin audit trail"
        description="Read-only. Search by actor, action type, and target email; actors are shown as resolved emails."
      />
      <form className="card grid gap-3 p-5 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); load(1); }}>
        <Field label="Actor email"><Input value={actorEmail} onChange={(event) => setActorEmail(event.target.value)} placeholder="operator@…" /></Field>
        <Field label="Action type">
          <select className={selectClass} value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="">Any action</option>
            {knownActions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </Field>
        <Field label="Target email"><Input value={targetEmail} onChange={(event) => setTargetEmail(event.target.value)} placeholder="learner@…" /></Field>
        <div className="flex items-end"><button className="button-primary w-full" type="submit"><Search className="size-icon-sm" aria-hidden="true" />Search</button></div>
      </form>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <p className="text-sm text-dacfp-gray-text" role="status">
        {result ? `${result.total} matching action${result.total === 1 ? '' : 's'}.` : 'Loading audit trail…'}
      </p>

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
                {(result?.rows ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-dacfp-gray-text">{new Date(row.created_at).toLocaleString()}</TableCell>
                    <TableCell className="font-bold text-dacfp-navy">{row.action}</TableCell>
                    <TableCell>{row.actor_email}</TableCell>
                    <TableCell><AuditTarget target={row.target} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <ul className="space-y-3 md:hidden">
        {(result?.rows ?? []).map((row) => (
          <li key={row.id} className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-dacfp-navy">{row.action}</span>
              <span className="shrink-0 text-xs text-dacfp-gray-text">{new Date(row.created_at).toLocaleString()}</span>
            </div>
            <dl className="mt-3 space-y-2 border-t border-dacfp-line pt-3 text-sm">
              <div className="flex gap-2"><dt className="shrink-0 font-semibold text-dacfp-gray-text">Actor</dt><dd className="min-w-0 break-all text-dacfp-navy">{row.actor_email}</dd></div>
              <div><dt className="font-semibold text-dacfp-gray-text">Target</dt><dd className="mt-1"><AuditTarget target={row.target} /></dd></div>
            </dl>
          </li>
        ))}
      </ul>

      <nav className="flex items-center justify-between" aria-label="Audit pages">
        <button className="button-quiet" disabled={page <= 1} type="button" onClick={() => load(page - 1)}>← Previous</button>
        <p className="text-sm tabular-nums text-dacfp-gray-text">Page {page} of {totalPages}</p>
        <button className="button-quiet" disabled={page >= totalPages} type="button" onClick={() => load(page + 1)}>Next →</button>
      </nav>
    </div>
  );
}
