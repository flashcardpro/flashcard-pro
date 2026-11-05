import { useEffect, useMemo, useRef } from 'react';
import { renderMathInElement, sanitize } from '../lib/render';
import { getMediaUrl } from '../lib/media';

/** Shows stored card HTML safely: sanitized, formulas rendered, photos loaded from local storage or Drive. */
export function RichHtml({ html, className = '', as: Tag = 'div' }: { html: string; className?: string; as?: 'div' | 'span' }) {
  const ref = useRef<HTMLElement>(null);
  const clean = useMemo(() => sanitize(html), [html]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = clean;
    renderMathInElement(el);
    el.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('fcp-media:')) {
        const id = src.slice('fcp-media:'.length);
        img.removeAttribute('src');
        img.dataset.mediaId = id;
        img.classList.add('is-loading');
        getMediaUrl(id).then((u) => {
          if (u) img.src = u;
          img.classList.remove('is-loading');
        });
      }
      img.loading = 'lazy';
    });
    el.querySelectorAll('a').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  }, [clean]);
  return <Tag ref={ref as any} className={'rich ' + className} />;
}
