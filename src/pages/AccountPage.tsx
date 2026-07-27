import { CheckCircle2, KeyRound, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Alert } from '../components/Alert';
import { Field } from '../components/Field';
import { IconTile } from '../components/IconTile';
import { PageHeader, formatDate } from '../components/common';
import { useLms } from '../context/LmsContext';
import type { CredentialIds, LearnerAddress } from '../data/types';
import { JOB_TITLE_OPTIONS, profileDisplayName } from '../lib/profile';

function emptyAddress(): Required<LearnerAddress> {
  return { line1: '', line2: '', city: '', state: '', postal: '', country: '' };
}

function addressForForm(address: LearnerAddress | null): Required<LearnerAddress> {
  return { ...emptyAddress(), ...(address ?? {}) };
}

function compactAddress(address: Required<LearnerAddress>): LearnerAddress | null {
  const entries = Object.entries(address)
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => value.length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) as LearnerAddress : null;
}

export function AccountPage() {
  const { catalog, snapshot, saveProfile } = useLms();
  const profile = snapshot.profile;
  const initialKnownJob = JOB_TITLE_OPTIONS.includes(profile.job_title as typeof JOB_TITLE_OPTIONS[number]);
  const [firstName, setFirstName] = useState(profile.first_name);
  const [middleName, setMiddleName] = useState(profile.middle_name ?? '');
  const [lastName, setLastName] = useState(profile.last_name);
  const [firm, setFirm] = useState(profile.firm);
  const [jobTitle, setJobTitle] = useState(initialKnownJob ? profile.job_title : 'Other');
  const [otherJobTitle, setOtherJobTitle] = useState(initialKnownJob ? '' : profile.job_title);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [firmUrl, setFirmUrl] = useState(profile.firm_url ?? '');
  const [address, setAddress] = useState(addressForForm(profile.address));
  const [credentialIds, setCredentialIds] = useState<CredentialIds>(profile.credential_ids);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const known = JOB_TITLE_OPTIONS.includes(profile.job_title as typeof JOB_TITLE_OPTIONS[number]);
    setFirstName(profile.first_name);
    setMiddleName(profile.middle_name ?? '');
    setLastName(profile.last_name);
    setFirm(profile.firm);
    setJobTitle(known ? profile.job_title : 'Other');
    setOtherJobTitle(known ? '' : profile.job_title);
    setPhone(profile.phone ?? '');
    setFirmUrl(profile.firm_url ?? '');
    setAddress(addressForForm(profile.address));
    setCredentialIds(profile.credential_ids);
    setSaved(false);
    setSaveError('');
  }, [profile]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      await saveProfile({
        ...profile,
        display_name: profileDisplayName(firstName, lastName),
        first_name: firstName.trim(),
        middle_name: middleName.trim() || null,
        last_name: lastName.trim(),
        firm: firm.trim(),
        job_title: (jobTitle === 'Other' ? otherJobTitle : jobTitle).trim(),
        phone: phone.trim() || null,
        firm_url: firmUrl.trim() || null,
        address: compactAddress(address),
        credential_ids: credentialIds,
      });
      setSaved(true);
    } catch {
      setSaveError('Your profile could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const setCredential = (key: keyof CredentialIds, value: string) => {
    setCredentialIds((current) => ({ ...current, [key]: value || undefined }));
  };
  const setAddressField = (key: keyof LearnerAddress, value: string) => {
    setAddress((current) => ({ ...current, [key]: value }));
  };
  const completedCourses = snapshot.completions.flatMap((completion) => {
    const course = catalog.courses.find((item) => item.id === completion.course_id);
    if (!course || course.status === 'archived') return [];
    const reporting = snapshot.ceReportingStatuses.find(
      (item) => item.completion_id === completion.id,
    );
    return [{ completion, course, reporting }];
  });

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Learner account" title="Profile and credentials" description="Manage your email-only learner identity, professional details, address, and optional credential IDs." />
      <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" onSubmit={(event) => void submit(event)}>
        <div className="space-y-6">
          <section className="card p-6 sm:p-8" aria-labelledby="identity-heading">
            <div className="flex items-center gap-3"><IconTile icon={ShieldCheck} size="sm" tone="brand" /><div><p className="eyebrow">Identity</p><h2 id="identity-heading" className="text-xl font-bold text-dacfp-navy">Learner identity</h2></div></div>
            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              <Field label="First name"><Input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" maxLength={200} required /></Field>
              <Field label="Middle name" hint="Optional"><Input value={middleName} onChange={(event) => setMiddleName(event.target.value)} autoComplete="additional-name" maxLength={200} /></Field>
              <Field label="Last name"><Input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" maxLength={200} required /></Field>
              <div className="sm:col-span-3"><Field label="Email" hint="Email is your sign-in identity. DACFP support can help if it needs to change."><Input className="bg-dacfp-wash text-dacfp-gray-text" type="email" value={profile.email} readOnly /></Field></div>
            </div>
          </section>

          <section className="card p-6 sm:p-8" aria-labelledby="professional-heading">
            <p className="eyebrow">Professional details</p>
            <h2 id="professional-heading" className="mt-1 text-xl font-bold text-dacfp-navy">Your practice</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Firm"><Input value={firm} onChange={(event) => setFirm(event.target.value)} autoComplete="organization" maxLength={200} required /></Field>
              <Field label="Job title">
                <select className="min-h-11 w-full rounded-[0.1875rem] border border-dacfp-line bg-white px-3 text-base text-dacfp-navy" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} autoComplete="organization-title" required>
                  {JOB_TITLE_OPTIONS.map((title) => <option key={title} value={title}>{title}</option>)}
                  <option value="Other">Other</option>
                </select>
              </Field>
              {jobTitle === 'Other' ? <Field label="Other job title"><Input value={otherJobTitle} onChange={(event) => setOtherJobTitle(event.target.value)} autoComplete="organization-title" maxLength={200} required /></Field> : null}
              <Field label="Phone" hint="Optional"><Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" maxLength={200} /></Field>
              <Field label="Firm website" hint="Optional"><Input type="url" value={firmUrl} onChange={(event) => setFirmUrl(event.target.value)} autoComplete="url" placeholder="https://" maxLength={200} /></Field>
            </div>
          </section>

          <section className="card p-6 sm:p-8" aria-labelledby="address-heading">
            <p className="eyebrow">Optional</p><h2 id="address-heading" className="mt-1 text-xl font-bold text-dacfp-navy">Mailing address</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Address line 1"><Input value={address.line1} onChange={(event) => setAddressField('line1', event.target.value)} autoComplete="address-line1" maxLength={200} /></Field></div>
              <div className="sm:col-span-2"><Field label="Address line 2"><Input value={address.line2} onChange={(event) => setAddressField('line2', event.target.value)} autoComplete="address-line2" maxLength={200} /></Field></div>
              <Field label="City"><Input value={address.city} onChange={(event) => setAddressField('city', event.target.value)} autoComplete="address-level2" maxLength={200} /></Field>
              <Field label="State / province"><Input value={address.state} onChange={(event) => setAddressField('state', event.target.value)} autoComplete="address-level1" maxLength={200} /></Field>
              <Field label="Postal code"><Input value={address.postal} onChange={(event) => setAddressField('postal', event.target.value)} autoComplete="postal-code" maxLength={200} /></Field>
              <Field label="Country"><Input value={address.country} onChange={(event) => setAddressField('country', event.target.value)} autoComplete="country-name" maxLength={200} /></Field>
            </div>
          </section>

          <section className="card p-6 sm:p-8" aria-labelledby="credentials-heading">
            <p className="eyebrow">Optional</p><h2 id="credentials-heading" className="mt-1 text-xl font-bold text-dacfp-navy">Professional credential IDs</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-dacfp-gray-text">Enter only IDs you hold. DACFP uses them to include eligible completions in CE reporting.</p>
            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              <Field label="CFP ID"><Input value={credentialIds.cfp ?? ''} onChange={(event) => setCredential('cfp', event.target.value)} placeholder="Optional" autoComplete="off" maxLength={64} /></Field>
              <Field label="IWI ID"><Input value={credentialIds.iwi ?? ''} onChange={(event) => setCredential('iwi', event.target.value)} placeholder="Optional" autoComplete="off" maxLength={64} /></Field>
              <Field label="CFA ID"><Input value={credentialIds.cfa ?? ''} onChange={(event) => setCredential('cfa', event.target.value)} placeholder="Optional" autoComplete="off" maxLength={64} /></Field>
            </div>
          </section>

          {completedCourses.length ? (
            <section className="card p-6 sm:p-8" aria-labelledby="ce-reporting-heading">
              <p className="eyebrow">Post-certification</p><h2 id="ce-reporting-heading" className="mt-1 text-xl font-bold text-dacfp-navy">CE reporting</h2>
              <ul className="mt-5 divide-y divide-dacfp-line rounded-lg border border-dacfp-line">
                {completedCourses.map(({ completion, course, reporting }) => {
                  const message = !credentialIds.cfp
                    ? 'Add your CFP Board ID to be included'
                    : reporting?.reported_at
                      ? `Reported to CFP Board on ${formatDate(reporting.reported_at)}`
                      : 'Reporting scheduled — DACFP reports within 14 days of certification';
                  return <li className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between" key={completion.id}><span className="font-bold text-dacfp-navy">{course.title}</span><span className="text-sm text-dacfp-gray-text">{message}</span></li>;
                })}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            <button className="button-primary" type="submit" disabled={saving}><Save className="size-icon-sm" aria-hidden="true" /> {saving ? 'Saving…' : 'Save profile'}</button>
            {saved ? <p className="inline-flex items-center gap-2 text-sm font-semibold text-status-positive" role="status"><CheckCircle2 className="size-icon-sm" aria-hidden="true" /> Profile saved</p> : null}
            {saveError ? <Alert tone="danger">{saveError}</Alert> : null}
          </div>
        </div>
        <aside className="card h-fit p-5" aria-labelledby="password-heading"><IconTile icon={KeyRound} size="sm" tone="brand" /><h2 id="password-heading" className="mt-4 font-bold text-dacfp-navy">Password</h2><p className="mt-2 text-sm leading-6 text-dacfp-gray-text">Password changes use a secure email recovery link sent to {profile.email}.</p><Link className="button-secondary mt-5 w-full" to="/reset">Change or reset password</Link></aside>
      </form>
    </div>
  );
}
