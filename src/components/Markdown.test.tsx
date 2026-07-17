import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

describe('Markdown — brief #16 rendering', () => {
  it('renders authored markdown as real elements, not literal characters', () => {
    const { container } = render(
      <Markdown>{'## Key concepts\n\nBitcoin is **scarce**.\n\n- First\n- Second'}</Markdown>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Key concepts' })).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('scarce');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    // The old bug: markdown source reaching the learner verbatim.
    expect(container.textContent).not.toContain('##');
    expect(container.textContent).not.toContain('**');
  });

  it('renders links, blockquotes and code', () => {
    const { container } = render(
      <Markdown>{'[DACFP](https://dacfp.test)\n\n> quoted\n\n`inline code`'}</Markdown>,
    );
    expect(screen.getByRole('link', { name: 'DACFP' })).toHaveAttribute('href', 'https://dacfp.test');
    expect(container.querySelector('blockquote')).toHaveTextContent('quoted');
    expect(container.querySelector('code')).toHaveTextContent('inline code');
  });
});

describe('Markdown — no raw HTML pass-through', () => {
  it('does not execute or emit script tags', () => {
    const { container } = render(
      <Markdown>{'<script>window.__pwned = true</script>\n\nSafe text.'}</Markdown>,
    );
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    expect(container).toHaveTextContent('Safe text.');
  });

  it('strips embedded HTML rather than rendering it', () => {
    const { container } = render(
      <Markdown>{'<div id="raw-html-leak">injected</div>\n\nBody.'}</Markdown>,
    );
    expect(container.querySelector('#raw-html-leak')).toBeNull();
  });

  it('drops img and iframe, so authored content cannot load or frame anything', () => {
    const { container } = render(
      <Markdown>
        {'![x](https://evil.test/pixel.png)\n\n<iframe src="https://evil.test"></iframe>'}
      </Markdown>,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('refuses javascript: hrefs while keeping https links', () => {
    const { container } = render(
      <Markdown>{'[bad](javascript:alert(1)) and [good](https://dacfp.test)'}</Markdown>,
    );
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('javascript:alert(1)');
    expect(hrefs).toContain('https://dacfp.test');
  });

  it('does not emit inline event handlers', () => {
    const { container } = render(
      <Markdown>{'<a href="https://x.test" onclick="window.__pwned=true">link</a>'}</Markdown>,
    );
    // Stronger than stripping the attribute: the raw anchor never becomes an
    // element at all, so there is nothing left to carry a handler.
    expect(container.querySelector('a')).toBeNull();
    expect(container.innerHTML).not.toContain('onclick');
  });
});
