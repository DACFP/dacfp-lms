import { Download } from 'lucide-react';
import { useState } from 'react';
import { useLms } from '../context/LmsContext';
import type { LmsLessonResource } from '../data/types';

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
      <a
        className={className}
        href={`/resources/${resource.id}`}
        onClick={(event) => {
          event.preventDefault();
          if (!loading) void download();
        }}
        aria-busy={loading}
      >
        <Download size={16} aria-hidden="true" />
        <span>{loading ? 'Preparing secure download…' : resource.title}</span>
      </a>
      {error ? <p className="mt-1 text-xs font-semibold text-status-danger" role="alert">{error}</p> : null}
    </div>
  );
}
