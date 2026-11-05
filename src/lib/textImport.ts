export type TermSep = 'tab' | 'comma' | 'dash' | 'custom';
export type CardSep = 'newline' | 'semicolon' | 'custom';

export interface TextImportOptions {
  termSep: TermSep;
  cardSep: CardSep;
  customTerm?: string;
  customCard?: string;
}

/** Parses Quizlet "export" text, CSV, or any term/definition list into [front, back] pairs. */
export function parseTermList(text: string, o: TextImportOptions): [string, string][] {
  if (o.termSep === 'comma' && o.cardSep === 'newline') return parseCsv(text).filter((r) => r.length >= 2 && (r[0] || r[1])).map((r) => [r[0].trim(), r.slice(1).join(', ').trim()]);
  const cardSep = o.cardSep === 'newline' ? /\r?\n/ : o.cardSep === 'semicolon' ? ';' : o.customCard || '\n\n';
  const termSep = o.termSep === 'tab' ? '\t' : o.termSep === 'comma' ? ',' : o.termSep === 'dash' ? ' - ' : o.customTerm || '\t';
  const out: [string, string][] = [];
  for (const chunk of text.split(cardSep as any)) {
    if (!chunk.trim()) continue;
    const idx = chunk.indexOf(termSep);
    if (idx < 0) out.push([chunk.trim(), '']);
    else out.push([chunk.slice(0, idx).trim(), chunk.slice(idx + termSep.length).trim()]);
  }
  return out;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Picks the most likely separators for pasted text. */
export function guessOptions(text: string): TextImportOptions {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  const tabs = lines.filter((l) => l.includes('\t')).length;
  const commas = lines.filter((l) => l.includes(',')).length;
  const dashes = lines.filter((l) => l.includes(' - ')).length;
  if (tabs >= lines.length * 0.6) return { termSep: 'tab', cardSep: 'newline' };
  if (dashes >= lines.length * 0.6) return { termSep: 'dash', cardSep: 'newline' };
  if (commas >= lines.length * 0.6) return { termSep: 'comma', cardSep: 'newline' };
  return { termSep: 'tab', cardSep: 'newline' };
}

export function textToHtml(s: string): string {
  return s
    .split(/\r?\n/)
    .map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('<br>');
}
