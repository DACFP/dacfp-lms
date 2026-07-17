import { CheckCircle2, KeyRound, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Alert } from '../components/Alert';
import { Field } from '../components/Field';
import { IconTile } from '../components/IconTile';
import { PageHeader } from '../components/common';
import { useLms } from '../context/LmsContext';
import type { CredentialIds } from '../data/types';

export function AccountPage() {
  const { snapshot, saveProfile } = useLms();
  const [displayName, setDisplayName] = useState(snapshot.profile.display_name);
  const [credentialIds, setCredentialIds] = useState<CredentialIds>(snapshot.profile.credential_ids);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setDisplayName(snapshot.profile.display_name);
    setCredentialIds(snapshot.profile.credential_ids);
    setSaved(false);
    setSaveError('');
  }, [snapshot.profile]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      await saveProfile({
        ...snapshot.profile,
        display_name: displayName.trim(),
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
              <IconTile icon={ShieldCheck} size="sm" tone="brand" />
              <div>
                <p className="eyebrow">Profile</p>
                <h2 id="identity-heading" className="text-xl font-bold text-dacfp-navy">Learner identity</h2>
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Full name">
                <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required />
              </Field>
              <Field
                label="Email"
                hint="Your email is tied to your sign-in identity. Contact DACFP support if it needs to change."
              >
                <Input className="bg-dacfp-wash text-dacfp-gray-text" type="email" value={snapshot.profile.email} readOnly />
              </Field>
            </div>
          </section>

          <section className="card p-6 sm:p-8" aria-labelledby="credentials-heading">
            <p className="eyebrow">Optional</p>
            <h2 id="credentials-heading" className="mt-1 text-xl font-bold text-dacfp-navy">Professional credential IDs</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-dacfp-gray-text">
              Enter only IDs you hold. DACFP will use them for CE credit reporting when that later workflow is available.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              <Field label="CFP ID">
                <Input value={credentialIds.cfp ?? ''} onChange={(event) => setCredential('cfp', event.target.value)} placeholder="Optional" autoComplete="off" />
              </Field>
              <Field label="IWI ID">
                <Input value={credentialIds.iwi ?? ''} onChange={(event) => setCredential('iwi', event.target.value)} placeholder="Optional" autoComplete="off" />
              </Field>
              <Field label="CFA ID">
                <Input value={credentialIds.cfa ?? ''} onChange={(event) => setCredential('cfa', event.target.value)} placeholder="Optional" autoComplete="off" />
              </Field>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            <button className="button-primary" type="submit" disabled={saving}>
              <Save className="size-icon-sm" aria-hidden="true" /> {saving ? 'Saving…' : 'Save profile'}
            </button>
            {saved ? (
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-status-positive" role="status">
                <CheckCircle2 className="size-icon-sm" aria-hidden="true" /> Profile saved
              </p>
            ) : null}
            {saveError ? <Alert tone="danger">{saveError}</Alert> : null}
          </div>
        </div>

        <aside className="card h-fit p-5" aria-labelledby="password-heading">
          <IconTile icon={KeyRound} size="sm" tone="brand" />
          <h2 id="password-heading" className="mt-4 font-bold text-dacfp-navy">Password</h2>
          <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">Password changes use a secure email recovery link sent to {snapshot.profile.email}.</p>
          <Link className="button-secondary mt-5 w-full" to={'/reset'}>
            Change or reset password
          </Link>
        </aside>
      </form>
    </div>
  );
}
