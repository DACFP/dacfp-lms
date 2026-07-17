import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DetailItem {
  label: string;
  value: ReactNode;
  /** Render the value in a monospace cell — for ids, refs, raw tokens. */
  mono?: boolean;
  /** Span both columns on wide layouts (long text, descriptions). */
  wide?: boolean;
}

/**
 * Key-value inspector (brief #21). Replaces the JSON `<pre>` / `<code>` dumps
 * the admin used to show — a navy block of `JSON.stringify(...)` an operator
 * had to read like source. A description list is the honest structure for
 * "labelled fields about one record": each field is announced with its name,
 * missing values read as an em dash rather than `null`, and nothing requires
 * parsing braces.
 */
export function DetailList({
  items,
  columns = 2,
  className,
}: {
  items: DetailItem[];
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-4',
        columns === 2 ? 'sm:grid-cols-2' : 'grid-cols-1',
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn('min-w-0', item.wide && columns === 2 ? 'sm:col-span-2' : undefined)}
        >
          <dt className="text-xs font-bold uppercase tracking-eyebrow text-dacfp-gray-text">
            {item.label}
          </dt>
          <dd
            className={cn(
              'mt-1 break-words text-sm text-dacfp-navy',
              item.mono ? 'font-mono text-xs' : 'font-semibold',
            )}
          >
            {item.value === null || item.value === undefined || item.value === '' ? (
              <span className="font-normal text-dacfp-gray-text" aria-label="Not set">
                —
              </span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
