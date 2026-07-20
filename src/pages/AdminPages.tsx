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
import type { AdminEnrollment, LearnerInspection } from '../data/admin';
import type { LmsCourse, LmsLesson, LmsModule } from '../data/types';
import { parseQuestionBankCsv, parseQuestionBankJson, serializeQuestionBankCsv } from '../lib/adminCsv';
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
        {catalog.courses.length === 0 ? (
          <div className="card mt-4 p-8 text-center">
            <h3 className="text-lg font-bold text-dacfp-navy">No courses yet</h3>
            <p className="mt-2 text-sm text-dacfp-gray-text">Create the first draft above to begin authoring.</p>
          </div>
        ) : <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalog.courses.map((course) => (
            <article key={course.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3"><p className="eyebrow">{course.slug}</p><StatusPill tone={course.status === 'published' ? 'positive' : course.status === 'archived' ? 'warning' : 'neutral'}>{course.status}</StatusPill></div>
              <h3 className="mt-3 text-xl font-bold text-dacfp-navy">{course.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-dacfp-gray-text">{course.description}</p>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-dacfp-gray-text">Progression</dt><dd className="font-bold text-dacfp-navy">{course.progression}</dd></div><div><dt className="text-dacfp-gray-text">CE credits</dt><dd className="font-bold text-dacfp-navy">{course.ce_credits ?? '—'}</dd></div></dl>
              <Link className="button-secondary mt-5" to={`/admin/course/${course.id}`}>Edit course</Link>
            </article>
          ))}
        </div>}
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
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // A stable per-module name so the two format radios form one group (L-12).
  const formatName = `qb-format-${module.id}`;

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-bold text-dacfp-navy">Question bank</h4><p className="text-sm text-dacfp-gray-text">Exactly 10 questions · 70% fixed pass policy</p></div><button className="button-secondary" type="button" onClick={() => void exportBank()}><Download className="size-icon-sm" aria-hidden="true" />Export CSV</button></div>
      <fieldset className="mt-4">
        <legend className="text-sm font-bold text-dacfp-navy">Import format</legend>
        <div className="mt-2 flex gap-4">
          <label className="flex items-center gap-2 text-sm font-bold"><input checked={format === 'csv'} name={formatName} onChange={() => setFormat('csv')} type="radio" className="size-4 accent-dacfp-blue" />CSV</label>
          <label className="flex items-center gap-2 text-sm font-bold"><input checked={format === 'json'} name={formatName} onChange={() => setFormat('json')} type="radio" className="size-4 accent-dacfp-blue" />JSON</label>
        </div>
      </fieldset>
      <Field label="Paste or load question bank" className="mt-4"><Textarea className="min-h-40 font-mono text-sm" value={input} onChange={(event) => setInput(event.target.value)} /></Field>
      <Field label="Or load a bank file" className="mt-3">
        <Input accept=".csv,.json,text/csv,application/json" className="py-2" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(setInput).catch(() => setError('Question bank file could not be read.')); }} />
      </Field>
      <div className="mt-4 space-y-3"><ErrorMessage message={error} /><SuccessMessage message={message} /><button className="button-primary" type="button" onClick={() => void importBank()}><FileUp className="size-icon-sm" aria-hidden="true" />Import and replace</button></div>
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
  const resources = catalog.resources
    .filter((resource) => resource.lesson_id === lesson.id)
    .sort((a, b) => a.position - b.position);
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
        <Field label="Kind"><select className={selectClass} name="kind" defaultValue={lesson.kind}><option value="video">Video</option><option value="reading">Reading</option></select></Field>
        <Field label="video_ref path"><Input name="video_ref" defaultValue={lesson.video_ref ?? ''} placeholder="placeholder/dacfp-d3-placeholder.mp4" /></Field>
        <Field label="Duration seconds"><Input name="duration_seconds" type="number" min="1" defaultValue={lesson.duration_seconds ?? ''} /></Field>
        <Field label="Reading body" className="md:col-span-2"><Textarea name="body_md" defaultValue={lesson.body_md ?? ''} /></Field>
        <label className="flex min-h-11 items-center gap-2"><input className="size-5 accent-dacfp-maroon" type="checkbox" name="is_required" defaultChecked={lesson.is_required} /><span className="font-bold">Required</span></label>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <button className="button-secondary" type="submit">Save lesson</button>
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
      <div className="mt-4 border-t border-dacfp-line pt-4">
        <h4 className="text-sm font-bold text-dacfp-navy">Attached resources</h4>
        {resources.length === 0 ? (
          <p className="mt-2 text-sm text-dacfp-gray-text">No resources attached.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {resources.map((resource) => (
              <li className="rounded-md bg-dacfp-wash px-3 py-2 text-sm" key={resource.id}>
                <span className="font-semibold text-dacfp-navy">{resource.title}</span>{' '}
                <span className="font-mono text-xs text-dacfp-gray-text">{resource.file_ref}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 space-y-2"><ErrorMessage message={error} /><SuccessMessage message={message} /></div>
    </article>
  );
}

function ModuleEditor({ module, modules }: { module: LmsModule; modules: LmsModule[] }) {
  const { catalog, mutate } = useAdmin();
  const lessons = catalog.lessons.filter((lesson) => lesson.module_id === module.id).sort((a, b) => a.position - b.position);
  const [lessonTitle, setLessonTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [draggingLessonId, setDraggingLessonId] = useState<string | null>(null);

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

  const dropLessonBefore = async (draggedId: string, targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const source = lessons.findIndex((item) => item.id === draggedId);
    const target = lessons.findIndex((item) => item.id === targetId);
    if (source < 0 || target < 0) return;
    const next = [...lessons];
    const [moved] = next.splice(source, 1);
    next.splice(target, 0, moved);
    await handleMutation(reorderLessons(next));
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
        <form className="flex flex-1 flex-col gap-3 sm:flex-row" onSubmit={async (event) => { event.preventDefault(); const title = new FormData(event.currentTarget).get('title'); await handleMutation(mutate('update_module', { id: module.id, title })); }}>
          <Input name="title" defaultValue={module.title} aria-label={`Module ${module.position} title`} />
          <button className="button-secondary shrink-0" type="submit">Save module</button>
        </form>
        <div className="flex shrink-0 items-center gap-1">
          <ReorderControls
            label={module.title}
            atStart={module.position === 1}
            atEnd={module.position === modules.length}
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
          <div
            key={lesson.id}
            className={`space-y-2 rounded-lg ${draggingLessonId === lesson.id ? 'ring-2 ring-dacfp-blue' : ''}`}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('application/x-dacfp-lesson')) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void dropLessonBefore(event.dataTransfer.getData('application/x-dacfp-lesson'), lesson.id);
            }}
          >
            <div className="flex justify-end">
              <button
                type="button"
                aria-label={`Drag to reorder ${lesson.title}`}
                title="Drag to reorder lesson"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-dacfp-lesson', lesson.id);
                  event.dataTransfer.effectAllowed = 'move';
                  setDraggingLessonId(lesson.id);
                }}
                onDragEnd={() => setDraggingLessonId(null)}
                className="mr-1 hidden size-9 shrink-0 cursor-grab place-items-center rounded-md text-dacfp-gray-text hover:bg-dacfp-wash-blue hover:text-dacfp-navy active:cursor-grabbing sm:grid"
              >
                <GripVertical className="size-icon-md" aria-hidden="true" />
              </button>
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
      <form className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-dacfp-gray-text p-4 sm:flex-row" onSubmit={async (event) => { event.preventDefault(); await handleMutation(mutate('create_lesson', { module_id: module.id, title: lessonTitle, kind: 'video', is_required: true, duration_seconds: 4 }).then(() => setLessonTitle(''))); }}>
        <Input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} required placeholder="New lesson title" aria-label="New lesson title" /><button className="button-secondary shrink-0" type="submit"><Plus className="size-icon-sm" aria-hidden="true" />Add lesson</button>
      </form>
      <QuestionBankPanel module={module} />
    </article>
  );
}

export function AdminCoursePage() {
  const { id } = useParams();
  const { catalog, mutate } = useAdmin();
  const navigate = useNavigate();
  const course = catalog.courses.find((item) => item.id === id);
  const modules = catalog.modules.filter((item) => item.course_id === id).sort((a, b) => a.position - b.position);
  const [moduleTitle, setModuleTitle] = useState('');
  if (!course) return <div className="card p-8 text-center"><h1 className="text-2xl font-bold text-dacfp-navy">Course unavailable</h1><Link className="button-secondary mt-5" to="/admin">Back to courses</Link></div>;

  return (
    <div className="space-y-8">
      <Link className="button-quiet" to="/admin"><ArrowLeft className="size-icon-sm" aria-hidden="true" />Back to courses</Link>
      <PageHeader eyebrow={`Course editor · ${course.status}`} title={course.title} description="Manage structure, private resources, fixed-policy question banks, and publication status." />
      <CourseSettings course={course} />
      <section className="card border-status-danger/30 p-5 sm:p-6" aria-labelledby="delete-course-heading">
        <h2 id="delete-course-heading" className="text-xl font-bold text-dacfp-navy">Delete course</h2>
        <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">Permanently removes this course and its modules, lessons, resources, question banks, and enrollment history.</p>
        <ConfirmDialog
          trigger={<button className="button-quiet mt-4 text-status-danger" type="button"><Trash2 className="size-icon-sm" aria-hidden="true" />Delete course</button>}
          title="Delete this course?"
          description={`"${course.title}" and all nested content and learner history will be permanently removed. This cannot be undone.`}
          confirmLabel="Delete course"
          onConfirm={async () => {
            try {
              await mutate('delete_course', { id: course.id });
              navigate('/admin', { replace: true });
            } catch {
              // The shared mutation banner preserves the editor and reports failure.
            }
          }}
        />
      </section>
      <section className="space-y-4" aria-labelledby="modules-heading">
        <div><p className="eyebrow">Curriculum</p><h2 id="modules-heading" className="mt-1 text-2xl font-bold text-dacfp-navy">Modules and lessons</h2><p className="mt-2 text-sm text-dacfp-gray-text">Drag the grip handle to reorder on larger screens, or use the up/down controls on any device.</p></div>
        {modules.map((module) => <ModuleEditor key={module.id} module={module} modules={modules} />)}
        <form className="card flex flex-col gap-3 p-5 sm:flex-row" onSubmit={async (event) => { event.preventDefault(); await handleMutation(mutate('create_module', { course_id: course.id, title: moduleTitle, ce_credits: null }).then(() => setModuleTitle(''))); }}>
          <Input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} required placeholder="New module title" aria-label="New module title" /><button className="button-primary shrink-0" type="submit"><Plus className="size-icon-sm" aria-hidden="true" />Add module</button>
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
  onSupport: (action: string, payload: Record<string, unknown>) => void;
}) {
  const { catalog } = useAdmin();
  const summary = inspection.summaries.find((item) => item.enrollment_id === enrollment.id);
  const moduleIds = catalog.modules.filter((item) => item.course_id === enrollment.course_id).map((item) => item.id);
  const quizzes = catalog.quizzes.filter((item) => moduleIds.includes(item.module_id));
  const progress = inspection.progress.filter((item) => item.enrollment_id === enrollment.id);
  const attempts = inspection.attempts.filter((item) => item.enrollment_id === enrollment.id);
  const completion = inspection.completions.find((item) => item.enrollment_id === enrollment.id);

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

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-dacfp-wash p-4"><p className="text-sm text-dacfp-gray-text">Progress rows</p><p className="text-2xl font-bold tabular-nums text-dacfp-navy">{progress.length}</p></div>
        <div className="rounded-lg bg-dacfp-wash p-4"><p className="text-sm text-dacfp-gray-text">Attempts</p><p className="text-2xl font-bold tabular-nums text-dacfp-navy">{attempts.length}</p></div>
        <div className="rounded-lg bg-dacfp-wash p-4"><p className="text-sm text-dacfp-gray-text">CE credits</p><p className="text-2xl font-bold tabular-nums text-dacfp-navy">{enrollment.lms_courses.ce_credits ?? '—'}</p></div>
      </div>

      <div className="mt-5 border-t border-dacfp-line pt-5">
        <DetailList items={facts} />
      </div>

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

      <div className="mt-5 border-t border-dacfp-line pt-5">
        <h4 className="text-sm font-bold text-dacfp-navy">Lesson progress</h4>
        {progress.length === 0 ? (
          <p className="mt-2 text-sm text-dacfp-gray-text">No lesson progress recorded.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {progress.map((item) => {
              const lesson = catalog.lessons.find((candidate) => candidate.id === item.lesson_id);
              return (
                <li className="rounded-lg border border-dacfp-line px-3 py-2 text-sm" key={item.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-dacfp-navy">{lesson?.title ?? item.lesson_id}</span>
                    <StatusPill tone={item.completed_at ? 'positive' : 'neutral'}>{item.completed_at ? 'Complete' : 'In progress'}</StatusPill>
                  </div>
                  <p className="mt-1 text-xs text-dacfp-gray-text">Resume {formatClock(item.last_position_seconds)} · Furthest watched {formatClock(item.max_watched_seconds)} · Updated {new Date(item.updated_at).toLocaleString()}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-5 border-t border-dacfp-line pt-5">
        <h4 className="text-sm font-bold text-dacfp-navy">Completion events</h4>
        {completion ? (
          <DetailList items={[
            { label: 'Completed', value: formatDate(completion.completed_at) },
            { label: 'Trigger', value: completion.trigger },
            { label: 'Processed', value: completion.processed_at ? formatDate(completion.processed_at) : null },
            { label: 'Designation issued', value: completion.designation_issued ? 'Yes' : 'No' },
          ]} />
        ) : (
          <p className="mt-2 text-sm text-dacfp-gray-text">No completion event recorded.</p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-dacfp-line pt-5 sm:flex-row sm:flex-wrap">
        <ConfirmDialog
          trigger={<button className="button-secondary" type="button"><CheckCircle2 className="size-icon-sm" aria-hidden="true" />Manual mark complete</button>}
          title="Mark this enrollment complete?"
          description={`This records a manual completion event for "${enrollment.lms_courses.title}" against this learner. It is written to the audit trail.`}
          confirmLabel="Mark complete"
          onConfirm={() => onSupport('manual_mark_complete', { enrollment_id: enrollment.id })}
        />
        {quizzes.map((quiz) => (
          <ConfirmDialog
            key={quiz.id}
            trigger={<button className="button-secondary" type="button">Reset Module {catalog.modules.find((item) => item.id === quiz.module_id)?.position ?? '?'} quiz attempts</button>}
            title={`Reset Module ${catalog.modules.find((item) => item.id === quiz.module_id)?.position ?? '?'} quiz attempt history?`}
            description="Every recorded attempt for this quiz will be permanently removed for this learner. Their pass/fail state is recomputed from an empty history. This cannot be undone."
            confirmLabel="Reset attempts"
            onConfirm={() => onSupport('reset_attempt_history', { enrollment_id: enrollment.id, quiz_id: quiz.id })}
          />
        ))}
      </div>
    </article>
  );
}

export function AdminLearnersPage() {
  const { inspectLearner, mutate } = useAdmin();
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
        { label: 'CFP ID', value: inspection.profile?.credential_ids?.cfp ?? null, mono: true },
        { label: 'IWI ID', value: inspection.profile?.credential_ids?.iwi ?? null, mono: true },
        { label: 'CFA ID', value: inspection.profile?.credential_ids?.cfa ?? null, mono: true },
      ]
    : [];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Learner support" title="Per-learner inspector" description="Search one person by email, review enrollment evidence, and use only the two audited support actions." />
      <form className="card flex flex-col gap-3 p-5 sm:flex-row" onSubmit={(event) => void search(event)}><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="learner@example.test" required aria-label="Learner email" /><button className="button-primary shrink-0" type="submit"><Search className="size-icon-sm" aria-hidden="true" />Inspect learner</button></form>
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

      {audit.length === 0 ? (
        <div className="card p-8 text-center">
          <h2 className="text-lg font-bold text-dacfp-navy">No admin actions yet</h2>
          <p className="mt-2 text-sm text-dacfp-gray-text">Audited mutations will appear here after the first authoring or support action.</p>
        </div>
      ) : null}

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
