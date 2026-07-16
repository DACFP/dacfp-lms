import { CheckCircle2, KeyRound, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, learnerPath } from '../components/common';
import { useLms } from '../context/LmsContext';
import type { CredentialIds } from '../data/types';

export function AccountPage() {
  const { snapshot, selectedLearner, saveProfile } = useLms();
  const [displayName, setDisplayName] = useState(snapshot.profile.display_name);
  const [credentialIds, setCredentialIds] = useState<CredentialIds>(snapshot.profile.credential_ids);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDisplayName(snapshot.profile.display_name);
    setCredentialIds(snapshot.profile.credential_ids);
    setSaved(false);
  }, [snapshot.profile]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    await saveProfile({ ...snapshot.profile, display_name: displayName, credential_ids: credentialIds });
    setSaving(false);
    setSaved(true);
  };

  const setCredential = (key: keyof CredentialIds, value: string) => {
    setCredentialIds((current) => ({ ...current, [key]: value || undefined }));
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Learner account"
        title="Profile and credentials"
        description="Manage your learner identity and optional professional credential IDs. These IDs are collected for a future CE reporting workflow."
      />

      <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" onSubmit={(event) => void submit(event)}>
        <div className="space-y-6">
          <section className="card p-6 sm:p-8" aria-labelledby="identity-heading">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-dacfp-wash-blue text-brand-royal">
                <ShieldCheck size={20} aria-hidden="true" />
              </div>
              <div>
                <p className="eyebrow">Profile</p>
                <h2 id="identity-heading" className="text-xl font-bold text-brand-navy">Learner identity</h2>
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-brand-navy">Full name</span>
                <input className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-brand-navy">Email</span>
                <input className="field bg-dacfp-wash text-dacfp-slate" type="email" value={snapshot.profile.email} readOnly aria-describedby="email-help" />
                <span id="email-help" className="mt-2 block text-xs leading-5 text-dacfp-slate">Email changes are not part of the D0 mock.</span>
              </label>
            </div>
          </section>

          <section className="card p-6 sm:p-8" aria-labelledby="credentials-heading">
            <p className="eyebrow">Optional</p>
            <h2 id="credentials-heading" className="mt-1 text-xl font-bold text-brand-navy">Professional credential IDs</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-dacfp-slate">
              Enter only IDs you hold. DACFP will use them for CE credit reporting when that later workflow is available.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-brand-navy">CFP ID</span>
                <input className="field" value={credentialIds.cfp ?? ''} onChange={(event) => setCredential('cfp', event.target.value)} placeholder="Optional" autoComplete="off" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-brand-navy">IWI ID</span>
                <input className="field" value={credentialIds.iwi ?? ''} onChange={(event) => setCredential('iwi', event.target.value)} placeholder="Optional" autoComplete="off" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-brand-navy">CFA ID</span>
                <input className="field" value={credentialIds.cfa ?? ''} onChange={(event) => setCredential('cfa', event.target.value)} placeholder="Optional" autoComplete="off" />
              </label>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            <button className="button-primary" type="submit" disabled={saving}>
              <Save size={17} aria-hidden="true" /> {saving ? 'Saving…' : 'Save profile'}
            </button>
            {saved ? (
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-status-positive" role="status">
                <CheckCircle2 size={17} aria-hidden="true" /> Synthetic profile saved
              </p>
            ) : null}
          </div>
        </div>

        <aside className="card h-fit p-5" aria-labelledby="password-heading">
          <div className="grid size-10 place-items-center rounded-lg bg-dacfp-wash-blue text-brand-royal">
            <KeyRound size={20} aria-hidden="true" />
          </div>
          <h2 id="password-heading" className="mt-4 font-bold text-brand-navy">Password</h2>
          <p className="mt-2 text-sm leading-6 text-dacfp-slate">Use the reset route to preview the email-OTP password recovery shell.</p>
          <Link className="button-secondary mt-5 w-full" to={learnerPath('/reset', selectedLearner)}>
            Reset password
          </Link>
        </aside>
      </form>
    </div>
  );
}
