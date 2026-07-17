import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Download,
  FileUp,
  GripVertical,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, StatusPill, formatDate } from '../components/common';
import { useAdmin } from '../context/AdminContext';
import type { LearnerInspection, QuestionBank } from '../data/admin';
import type { LmsCourse, LmsLesson, LmsModule } from '../data/types';
import { parseQuestionBankCsv, parseQuestionBankJson, serializeQuestionBankCsv } from '../lib/adminCsv';

function ErrorMessage({ message }: { message: string }) {
  return message ? <p className="rounded-lg border border-status-danger/25 bg-status-danger/10 p-3 text-sm font-semibold text-status-danger" role="alert">{message}</p> : null;
}

function SuccessMessage({ message }: { message: string }) {
  return message ? <p className="rounded-lg border border-status-positive/25 bg-status-positive/10 p-3 text-sm font-semibold text-status-positive" role="status">{message}</p> : null;
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
      <section className="card p-5 sm:p-6" aria-labelledby="create-course-heading">
        <h2 id="create-course-heading" className="text-xl font-bold text-brand-navy">Create a draft course</h2>
        <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={(event) => void create(event)}>
          <label className="block"><span className="mb-2 block text-sm font-bold text-brand-navy">Course title</span><input className="field" name="title" required placeholder="Renewal 2027 Sandbox" /></label>
          <label className="block"><span className="mb-2 block text-sm font-bold text-brand-navy">Slug</span><input className="field" name="slug" required pattern="[a-z0-9-]+" placeholder="renewal-2027-sandbox" /></label>
          <label className="block lg:col-span-2"><span className="mb-2 block text-sm font-bold text-brand-navy">Description</span><textarea className="field min-h-24" name="description" required /></label>
          <div className="lg:col-span-2"><ErrorMessage message={error} /></div>
          <div className="lg:col-span-2"><button className="button-primary" disabled={creating} type="submit"><Plus size={17} aria-hidden="true" />{creating ? 'Creating…' : 'Create draft'}</button></div>
        </form>
      </section>
      <section aria-labelledby="catalog-heading">
        <h2 id="catalog-heading" className="text-xl font-bold text-brand-navy">All courses</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalog.courses.map((course) => (
            <article key={course.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3"><p className="eyebrow">{course.slug}</p><StatusPill tone={course.status === 'published' ? 'positive' : course.status === 'archived' ? 'warning' : 'neutral'}>{course.status}</StatusPill></div>
              <h3 className="mt-3 text-xl font-bold text-brand-navy">{course.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-dacfp-slate">{course.description}</p>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-dacfp-slate">Progression</dt><dd className="font-bold text-brand-navy">{course.progression}</dd></div><div><dt className="text-dacfp-slate">CE credits</dt><dd className="font-bold text-brand-navy">{course.ce_credits ?? '—'}</dd></div></dl>
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
      <h2 id="course-settings-heading" className="text-xl font-bold text-brand-navy">Course settings</h2>
      <form key={`${course.id}-${course.title}-${course.status}`} className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={(event) => void save(event)}>
        <label><span className="mb-2 block text-sm font-bold text-brand-navy">Title</span><input className="field" name="title" defaultValue={course.title} required /></label>
        <label><span className="mb-2 block text-sm font-bold text-brand-navy">Slug</span><input className="field" name="slug" defaultValue={course.slug} pattern="[a-z0-9-]+" required /></label>
        <label className="md:col-span-2"><span className="mb-2 block text-sm font-bold text-brand-navy">Description</span><textarea className="field min-h-24" name="description" defaultValue={course.description} required /></label>
        <label><span className="mb-2 block text-sm font-bold text-brand-navy">Publication</span><select className="field" name="status" defaultValue={course.status}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
        <label><span className="mb-2 block text-sm font-bold text-brand-navy">Progression</span><select className="field" name="progression" defaultValue={course.progression}><option value="sequential">Sequential</option><option value="open">Open</option></select></label>
        <label><span className="mb-2 block text-sm font-bold text-brand-navy">Prerequisite</span><select className="field" name="prerequisite_course_id" defaultValue={course.prerequisite_course_id ?? ''}><option value="">None</option>{catalog.courses.filter((item) => item.id !== course.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label><span className="mb-2 block text-sm font-bold text-brand-navy">CE credits</span><input className="field" name="ce_credits" defaultValue={course.ce_credits ?? ''} min="0" step="0.5" type="number" /></label>
        <div className="rounded-lg border border-brand-gold/35 bg-brand-gold/10 p-4 md:col-span-2">
          <label className="block"><span className="text-sm font-bold text-brand-navy">Exam pass policy</span><input className="field mt-2 bg-dacfp-wash font-bold" readOnly value="70%" aria-readonly="true" /></label>
          <p className="mt-2 text-sm leading-6 text-dacfp-slate">70% is a published program requirement, not a configurable course setting. Imports with any other pass_pct are rejected.</p>
        </div>
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-dacfp-line p-3 md:col-span-2"><input defaultChecked={course.requires_terms_acceptance} name="requires_terms_acceptance" type="checkbox" className="size-5" /><span className="font-bold text-brand-navy">Require first-entry terms acceptance</span></label>
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

function QuestionBankPanel({ module }: { module: LmsModule }) {
  const { mutate, exportQuestionBank } = useAdmin();
  const [input, setInput] = useState('');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const importBank = async () => {
    setError(''); setMessage('');
    try {
      const bank = format === 'csv' ? parseQuestionBankCsv(input) : parseQuestionBankJson(input);
      await mutate('import_question_bank', { module_id: module.id, pass_pct: bank.pass_pct, questions: bank.questions });
      setMessage('10-question bank imported at the fixed 70% policy.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Question bank import failed.'); }
  };

  const exportBank = async () => {
    setError('');
    try {
      const bank = await exportQuestionBank(module.id);
      if (bank.pass_pct !== 70) throw new Error('Export was blocked because pass_pct was not 70.');
      const csv = serializeQuestionBankCsv(bank);
      setFormat('csv');
      setInput(csv);
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      anchor.download = `${module.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-questions.csv`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
      setMessage('Question bank exported in round-trip CSV format.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Question bank export failed.'); }
  };

  return (
    <div className="mt-5 rounded-lg border border-dacfp-line bg-dacfp-wash p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-bold text-brand-navy">Question bank</h4><p className="text-sm text-dacfp-slate">Exactly 10 questions · 70% fixed pass policy</p></div><button className="button-secondary" type="button" onClick={() => void exportBank()}><Download size={16} aria-hidden="true" />Export CSV</button></div>
      <div className="mt-4 flex gap-4"><label className="flex items-center gap-2 text-sm font-bold"><input checked={format === 'csv'} onChange={() => setFormat('csv')} type="radio" />CSV</label><label className="flex items-center gap-2 text-sm font-bold"><input checked={format === 'json'} onChange={() => setFormat('json')} type="radio" />JSON</label></div>
      <label className="mt-4 block"><span className="mb-2 block text-sm font-bold text-brand-navy">Paste or load question bank</span><textarea className="field min-h-40 font-mono text-sm" value={input} onChange={(event) => setInput(event.target.value)} /></label>
      <input className="mt-3 block max-w-full text-sm" accept=".csv,.json,text/csv,application/json" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(setInput); }} />
      <div className="mt-4 space-y-3"><ErrorMessage message={error} /><SuccessMessage message={message} /><button className="button-primary" type="button" onClick={() => void importBank()}><FileUp size={16} aria-hidden="true" />Import and replace</button></div>
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
  const { mutate } = useAdmin();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setMessage('');
    const values = new FormData(event.currentTarget);
    try {
      await mutate('update_lesson', { id: lesson.id, title: values.get('title'), kind: values.get('kind'), video_ref: values.get('video_ref'), duration_seconds: values.get('duration_seconds'), body_md: values.get('body_md'), is_required: values.get('is_required') === 'on' });
      setMessage('Lesson saved.');
    } catch { setError('Lesson could not be saved.'); }
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setMessage('');
    const values = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
    } catch { setError('Resource upload failed. Check its type and 5 MB size limit.'); }
  };

  return (
    <article className="rounded-lg border border-dacfp-line bg-white p-4">
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void save(event)}>
        <label><span className="mb-1 block text-xs font-bold uppercase text-dacfp-slate">Lesson title</span><input className="field" name="title" defaultValue={lesson.title} required /></label>
        <label><span className="mb-1 block text-xs font-bold uppercase text-dacfp-slate">Kind</span><select className="field" name="kind" defaultValue={lesson.kind}><option value="video">Video</option><option value="reading">Reading</option></select></label>
        <label><span className="mb-1 block text-xs font-bold uppercase text-dacfp-slate">video_ref path</span><input className="field" name="video_ref" defaultValue={lesson.video_ref ?? ''} placeholder="placeholder/dacfp-d3-placeholder.mp4" /></label>
        <label><span className="mb-1 block text-xs font-bold uppercase text-dacfp-slate">Duration seconds</span><input className="field" name="duration_seconds" type="number" min="1" defaultValue={lesson.duration_seconds ?? ''} /></label>
        <label className="md:col-span-2"><span className="mb-1 block text-xs font-bold uppercase text-dacfp-slate">Reading body</span><textarea className="field" name="body_md" defaultValue={lesson.body_md ?? ''} /></label>
        <label className="flex min-h-11 items-center gap-2"><input className="size-5" type="checkbox" name="is_required" defaultChecked={lesson.is_required} /><span className="font-bold">Required</span></label>
        <div className="flex flex-wrap gap-2 md:justify-end"><button className="button-secondary" type="submit">Save lesson</button><button className="button-quiet text-status-danger" type="button" onClick={() => { if (window.confirm('Delete this lesson and its content?')) void mutate('delete_lesson', { id: lesson.id }); }}><Trash2 size={16} aria-hidden="true" />Delete</button></div>
      </form>
      <form className="mt-4 grid gap-3 border-t border-dacfp-line pt-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => void upload(event)}>
        <input className="field" name="resource_title" required placeholder="Resource title" aria-label="Resource title" />
        <input className="field py-2" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv" aria-label="Resource file" />
        <button className="button-secondary" type="submit"><FileUp size={16} aria-hidden="true" />Upload</button>
        <label className="sm:col-span-3"><span className="mb-1 block text-xs font-bold uppercase text-dacfp-slate">Or create a text resource</span><textarea className="field min-h-24" name="text_content" placeholder="Paste sandbox text content when no file is selected." /></label>
      </form>
      <div className="mt-3 space-y-2"><ErrorMessage message={error} /><SuccessMessage message={message} /></div>
    </article>
  );
}

function ModuleEditor({ module, modules }: { module: LmsModule; modules: LmsModule[] }) {
  const { catalog, mutate } = useAdmin();
  const lessons = catalog.lessons.filter((lesson) => lesson.module_id === module.id).sort((a, b) => a.position - b.position);
  const [lessonTitle, setLessonTitle] = useState('');
  const [dragged, setDragged] = useState('');

  const reorderLessons = (next: LmsLesson[]) => mutate('reorder', { kind: 'lessons', parent_id: module.id, ordered_ids: next.map((item) => item.id) });
  return (
    <article className="card p-5 sm:p-6" draggable onDragStart={() => setDragged(module.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged && dragged !== module.id) { const source = modules.findIndex((item) => item.id === dragged); const target = modules.findIndex((item) => item.id === module.id); const next = [...modules]; const [moved] = next.splice(source, 1); next.splice(target, 0, moved); void mutate('reorder', { kind: 'modules', parent_id: module.course_id, ordered_ids: next.map((item) => item.id) }); } setDragged(''); }}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <GripVertical className="hidden text-dacfp-mist sm:block" aria-hidden="true" />
        <form className="flex flex-1 flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); const title = new FormData(event.currentTarget).get('title'); void mutate('update_module', { id: module.id, title }); }}>
          <input className="field" name="title" defaultValue={module.title} aria-label={`Module ${module.position} title`} />
          <button className="button-secondary" type="submit">Save module</button>
        </form>
        <div className="flex gap-1">
          <button className="button-quiet px-3" disabled={module.position === 1} aria-label={`Move ${module.title} up`} type="button" onClick={() => void mutate('reorder', { kind: 'modules', parent_id: module.course_id, ordered_ids: orderMove(modules, module.id, -1).map((item) => item.id) })}><ArrowUp size={17} /></button>
          <button className="button-quiet px-3" disabled={module.position === modules.length} aria-label={`Move ${module.title} down`} type="button" onClick={() => void mutate('reorder', { kind: 'modules', parent_id: module.course_id, ordered_ids: orderMove(modules, module.id, 1).map((item) => item.id) })}><ArrowDown size={17} /></button>
          <button className="button-quiet px-3 text-status-danger" aria-label={`Delete ${module.title}`} type="button" onClick={() => { if (window.confirm('Delete this module and all lessons?')) void mutate('delete_module', { id: module.id }); }}><Trash2 size={17} /></button>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {lessons.map((lesson) => (
          <div key={lesson.id} className="space-y-2">
            <div className="flex justify-end gap-1"><button className="button-quiet px-3" disabled={lesson.position === 1} aria-label={`Move ${lesson.title} up`} onClick={() => void reorderLessons(orderMove(lessons, lesson.id, -1))} type="button"><ArrowUp size={16} /></button><button className="button-quiet px-3" disabled={lesson.position === lessons.length} aria-label={`Move ${lesson.title} down`} onClick={() => void reorderLessons(orderMove(lessons, lesson.id, 1))} type="button"><ArrowDown size={16} /></button></div>
            <LessonEditor lesson={lesson} />
          </div>
        ))}
      </div>
      <form className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-dacfp-mist p-4 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void mutate('create_lesson', { module_id: module.id, title: lessonTitle, kind: 'video', is_required: true, duration_seconds: 4 }).then(() => setLessonTitle('')); }}>
        <input className="field" value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} required placeholder="New lesson title" aria-label="New lesson title" /><button className="button-secondary" type="submit"><Plus size={16} aria-hidden="true" />Add lesson</button>
      </form>
      <QuestionBankPanel module={module} />
    </article>
  );
}

export function AdminCoursePage() {
  const { id } = useParams();
  const { catalog, mutate } = useAdmin();
  const course = catalog.courses.find((item) => item.id === id);
  const modules = catalog.modules.filter((item) => item.course_id === id).sort((a, b) => a.position - b.position);
  const [moduleTitle, setModuleTitle] = useState('');
  if (!course) return <div className="card p-8 text-center"><h1 className="text-2xl font-bold text-brand-navy">Course unavailable</h1><Link className="button-secondary mt-5" to="/admin">Back to courses</Link></div>;

  return (
    <div className="space-y-8">
      <Link className="button-quiet" to="/admin"><ArrowLeft size={17} aria-hidden="true" />Back to courses</Link>
      <PageHeader eyebrow={`Course editor · ${course.status}`} title={course.title} description="Manage structure, private resources, fixed-policy question banks, and publication status." />
      <CourseSettings course={course} />
      <section className="space-y-4" aria-labelledby="modules-heading">
        <div><p className="eyebrow">Curriculum</p><h2 id="modules-heading" className="mt-1 text-2xl font-bold text-brand-navy">Modules and lessons</h2><p className="mt-2 text-sm text-dacfp-slate">Drag modules on larger screens, or use the up/down controls on any device.</p></div>
        {modules.map((module) => <ModuleEditor key={module.id} module={module} modules={modules} />)}
        <form className="card flex flex-col gap-3 p-5 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void mutate('create_module', { course_id: course.id, title: moduleTitle, ce_credits: null }).then(() => setModuleTitle('')); }}>
          <input className="field" value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} required placeholder="New module title" aria-label="New module title" /><button className="button-primary" type="submit"><Plus size={16} aria-hidden="true" />Add module</button>
        </form>
      </section>
    </div>
  );
}

export function AdminLearnersPage() {
  const { catalog, inspectLearner, mutate } = useAdmin();
  const [email, setEmail] = useState('');
  const [inspection, setInspection] = useState<LearnerInspection | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const search = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    try { setInspection(await inspectLearner(email)); }
    catch { setError('Learner inspection failed.'); }
  };

  const support = async (action: string, payload: Record<string, unknown>) => {
    setError(''); setMessage('');
    try {
      const result = await mutate<Record<string, unknown>>(action, payload);
      setMessage(`${action.replaceAll('_', ' ')} completed: ${JSON.stringify(result)}`);
      setInspection(await inspectLearner(email));
    } catch { setError('Support action failed.'); }
  };

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Learner support" title="Per-learner inspector" description="Search one person by email, review enrollment evidence, and use only the two audited support actions." />
      <form className="card flex flex-col gap-3 p-5 sm:flex-row" onSubmit={(event) => void search(event)}><input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="learner@example.test" required aria-label="Learner email" /><button className="button-primary" type="submit"><Search size={17} aria-hidden="true" />Inspect learner</button></form>
      <ErrorMessage message={error} /><SuccessMessage message={message} />
      {inspection === null ? <div className="card p-8 text-center"><h2 className="text-xl font-bold text-brand-navy">No learner found</h2><p className="mt-2 text-dacfp-slate">Check the exact email and try again.</p></div> : null}
      {inspection ? (
        <div className="space-y-6">
          <section className="card p-5"><h2 className="text-xl font-bold text-brand-navy">{inspection.profile?.display_name || inspection.user.email}</h2><p className="mt-1 text-dacfp-slate">{inspection.user.email}</p><pre className="mt-4 overflow-auto rounded-lg bg-brand-navy p-4 text-xs text-white">{JSON.stringify(inspection.profile?.credential_ids ?? {}, null, 2)}</pre></section>
          {inspection.enrollments.map((enrollment) => {
            const summary = inspection.summaries.find((item) => item.enrollment_id === enrollment.id);
            const moduleIds = catalog.modules.filter((item) => item.course_id === enrollment.course_id).map((item) => item.id);
            const quizzes = catalog.quizzes.filter((item) => moduleIds.includes(item.module_id));
            const progress = inspection.progress.filter((item) => item.enrollment_id === enrollment.id);
            const attempts = inspection.attempts.filter((item) => item.enrollment_id === enrollment.id);
            const completion = inspection.completions.find((item) => item.enrollment_id === enrollment.id);
            return (
              <article className="card p-5 sm:p-6" key={enrollment.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow">{enrollment.status}</p><h3 className="mt-1 text-xl font-bold text-brand-navy">{enrollment.lms_courses.title}</h3><p className="mt-1 text-sm text-dacfp-slate">Access expiry: {formatDate(enrollment.expires_at)} · {summary?.percent_complete ?? 0}% complete</p></div>{completion ? <StatusPill tone="positive">Completed</StatusPill> : <StatusPill tone="neutral">In progress</StatusPill>}</div>
                <div className="mt-5 grid gap-4 md:grid-cols-3"><div className="rounded-lg bg-dacfp-wash p-4"><p className="text-sm text-dacfp-slate">Progress rows</p><p className="text-2xl font-bold text-brand-navy">{progress.length}</p></div><div className="rounded-lg bg-dacfp-wash p-4"><p className="text-sm text-dacfp-slate">Attempts</p><p className="text-2xl font-bold text-brand-navy">{attempts.length}</p></div><div className="rounded-lg bg-dacfp-wash p-4"><p className="text-sm text-dacfp-slate">CE credits</p><p className="text-2xl font-bold text-brand-navy">{enrollment.lms_courses.ce_credits ?? '—'}</p></div></div>
                <div className="mt-5 flex flex-col gap-3 border-t border-dacfp-line pt-5 sm:flex-row sm:flex-wrap">
                  <button className="button-secondary" type="button" onClick={() => void support('manual_mark_complete', { enrollment_id: enrollment.id })}><CheckCircle2 size={17} aria-hidden="true" />Manual mark complete</button>
                  {quizzes.map((quiz) => <button key={quiz.id} className="button-secondary" type="button" onClick={() => void support('reset_attempt_history', { enrollment_id: enrollment.id, quiz_id: quiz.id })}>Reset quiz attempt history</button>)}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function AdminAuditPage() {
  const { audit } = useAdmin();
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Accountability" title="Admin audit trail" description="Every admin mutation, including CRUD, import, upload, reorder, and support actions, is written by the service boundary." action={<div className="flex items-center gap-2 rounded-lg bg-status-positive/10 px-3 py-2 text-sm font-bold text-status-positive"><ShieldCheck size={18} />{audit.length} recent actions</div>} />
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-dacfp-wash text-brand-navy"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Target</th></tr></thead><tbody className="divide-y divide-dacfp-line">{audit.map((action) => <tr key={action.id}><td className="whitespace-nowrap px-4 py-3 text-dacfp-slate">{new Date(action.created_at).toLocaleString()}</td><td className="px-4 py-3 font-bold text-brand-navy">{action.action}</td><td className="px-4 py-3 font-mono text-xs">{action.actor_auth_user_id}</td><td className="px-4 py-3"><code className="break-all text-xs">{JSON.stringify(action.target)}</code></td></tr>)}</tbody></table></div></div>
    </div>
  );
}
