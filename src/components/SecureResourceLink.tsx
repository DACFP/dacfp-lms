import { Download } from 'lucide-react';
import { useState } from 'react';
import { useLms } from '../context/LmsContext';
import type { LmsLessonResource } from '../data/types';
import { Alert } from './Alert';

export function SecureResourceLink({
  resource,
  className,
}: {
  resource: LmsLessonResource;
  className: string;
}) {
  const { requestResource } = useLms();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setLoading(true);
    setError('');
    try {
      const token = await requestResource(resource.id);
      const anchor = document.createElement('a');
      anchor.href = token.url;
      anchor.download = token.title;
      anchor.rel = 'noopener';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setError('Download unavailable. Refresh the page and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        className={className}
        onClick={() => {
          if (!loading) void download();
        }}
        disabled={loading}
        aria-busy={loading}
      >
        <Download className="size-icon-sm" aria-hidden="true" />
        <span>{loading ? 'Preparing secure download…' : resource.title}</span>
      </button>
      {error ? <Alert tone="danger" className="mt-2">{error}</Alert> : null}
    </div>
  );
}
