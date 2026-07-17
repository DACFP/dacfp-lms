import ReactMarkdown from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { cn } from '@/lib/utils';

/**
 * Reading renderer (brief #16).
 *
 * Readings were rendered as `{lesson.body_md}` inside a <p>, so authored
 * markdown reached the learner as literal "## " and "**" characters.
 *
 * SANITISATION: react-markdown already drops embedded HTML unless rehype-raw is
 * added — which it deliberately is not. rehype-sanitize is the second lock, so
 * that adding a raw-HTML plugin later cannot silently open an injection path
 * through operator-authored body_md. The schema is the hardened default minus
 * anything that can load or execute: no img/iframe/script, and protocols are
 * restricted to http/https/mailto so javascript: hrefs cannot survive.
 */
const schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter(
    (tag) => !['img', 'iframe', 'script', 'style', 'video', 'audio', 'object', 'embed'].includes(tag),
  ),
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
};

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'max-w-prose text-base leading-8 text-dacfp-navy',
        // Typographic rhythm for authored content. Tailwind resets headings, so
        // a reading has to be given its scale back explicitly.
        '[&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-dacfp-navy',
        '[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-dacfp-navy',
        '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-dacfp-navy',
        '[&_p]:mb-4 [&_p]:text-dacfp-gray-text',
        '[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6',
        '[&_li]:mb-1.5 [&_li]:text-dacfp-gray-text [&_li]:marker:text-dacfp-blue',
        '[&_strong]:font-bold [&_strong]:text-dacfp-navy',
        '[&_a]:font-semibold [&_a]:text-dacfp-blue [&_a]:underline [&_a]:underline-offset-2',
        '[&_blockquote]:my-5 [&_blockquote]:border-l-4 [&_blockquote]:border-dacfp-gold [&_blockquote]:bg-dacfp-wash [&_blockquote]:py-2 [&_blockquote]:pl-4 [&_blockquote]:italic',
        '[&_code]:rounded [&_code]:bg-dacfp-wash [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm',
        '[&_hr]:my-8 [&_hr]:border-dacfp-line',
        // No table styling: GFM tables need remark-gfm, a third dependency
        // beyond the two §2 names. Readings are CommonMark. Flagged in evidence.
        className,
      )}
    >
      <ReactMarkdown rehypePlugins={[[rehypeSanitize, schema]]}>{children}</ReactMarkdown>
    </div>
  );
}
