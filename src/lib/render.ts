import DOMPurify from 'dompurify';
import katex from 'katex';

const ALLOWED_URI = /^(?:(?:https?|mailto|data|blob|fcp-media):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/** Cleans HTML from cards (including decks other people shared) before it reaches the page. */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: [
      'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sub', 'sup', 'mark', 'span', 'p', 'br', 'div', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'a', 'font',
    ],
    ALLOWED_ATTR: ['style', 'class', 'src', 'alt', 'href', 'data-media-id', 'color', 'title', 'colspan', 'rowspan', 'data-color'],
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    ADD_ATTR: ['target'],
  });
}

const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?=\S)((?:\\\$|[^$\n])+?)(?<=\S)\$/g;

export function hasMath(text: string): boolean {
  MATH_RE.lastIndex = 0;
  return MATH_RE.test(text);
}

function renderMathString(text: string): string | null {
  MATH_RE.lastIndex = 0;
  if (!MATH_RE.test(text)) return null;
  MATH_RE.lastIndex = 0;
  let out = '';
  let last = 0;
  for (const m of text.matchAll(MATH_RE)) {
    const idx = m.index ?? 0;
    out += escapeText(text.slice(last, idx));
    const display = m[1] !== undefined || m[2] !== undefined;
    const tex = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim();
    try {
      out += katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html', strict: false });
    } catch {
      out += escapeText(m[0]);
    }
    last = idx + m[0].length;
  }
  out += escapeText(text.slice(last));
  return out;
}

function escapeText(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Replaces $...$ and $$...$$ in text nodes with rendered formulas. */
export function renderMathInElement(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (t.parentElement?.closest('.katex, code, pre')) continue;
    if (t.data.includes('$') || t.data.includes('\\(') || t.data.includes('\\[')) nodes.push(t);
  }
  for (const t of nodes) {
    const html = renderMathString(t.data);
    if (html == null) continue;
    const span = document.createElement('span');
    span.innerHTML = html;
    t.replaceWith(...Array.from(span.childNodes));
  }
}

/** Whole fields where math spans several text nodes are uncommon; this handles the common case. */
export function prepareHtml(html: string): string {
  return sanitize(html);
}
