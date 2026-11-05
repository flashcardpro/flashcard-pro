import type { Card, Library, Mask, Note } from './types';
import { emptySrs } from './srs';
import { stripHtml } from './util';

export const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

export function clozeNumbers(html: string): number[] {
  const set = new Set<number>();
  for (const m of html.matchAll(CLOZE_RE)) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}

export function nextClozeNumber(html: string): number {
  const nums = clozeNumbers(html);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/**
 * Renders cloze markup. The active number becomes a blank (front) or highlighted answer (back);
 * the other numbers show their text plainly.
 */
export function renderCloze(html: string, active: number | null, reveal: boolean): string {
  return html.replace(CLOZE_RE, (_m, n, text, hint) => {
    if (active !== null && Number(n) === active) {
      if (reveal) return `<span class="cloze-answer">${text}</span>`;
      return `<span class="cloze-blank">${hint ? escapeHtml(hint) : '[...]'}</span>`;
    }
    return text;
  });
}

export function clozeAnswer(html: string, active: number): string {
  const parts: string[] = [];
  for (const m of html.matchAll(CLOZE_RE)) if (Number(m[1]) === active) parts.push(m[2]);
  return parts.join(', ');
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function maskGroups(masks: Mask[]): number[] {
  return [...new Set(masks.map((m) => m.group))].sort((a, b) => a - b);
}

/** Which card ordinals a note should produce. */
export function ordsForNote(note: Note): string[] {
  switch (note.type) {
    case 'basic':
      return ['0'];
    case 'reverse':
      return ['0', '1'];
    case 'cloze': {
      const nums = clozeNumbers(note.front);
      return nums.length ? nums.map((n) => 'c' + n) : [];
    }
    case 'occlusion': {
      const groups = maskGroups(note.image?.masks || []);
      return groups.map((g) => 'g' + g);
    }
  }
}

export const cardId = (noteId: string, ord: string) => `${noteId}:${ord}`;

/** Returns cards to upsert and card ids to delete so a note's cards match its content. */
export function syncCardsForNote(lib: Library, note: Note, ts = Date.now()): { upserts: Card[]; deletes: string[] } {
  const wanted = new Set(ordsForNote(note));
  const existing = Object.values(lib.cards).filter((c) => c.noteId === note.id);
  const upserts: Card[] = [];
  const deletes: string[] = [];
  for (const c of existing) {
    if (!wanted.has(c.ord)) deletes.push(c.id);
    else if (c.deckId !== note.deckId) upserts.push({ ...c, deckId: note.deckId, updatedAt: ts });
    wanted.delete(c.ord);
  }
  for (const ord of wanted) {
    upserts.push({
      id: cardId(note.id, ord),
      noteId: note.id,
      deckId: note.deckId,
      ord,
      srs: emptySrs(ts),
      suspended: false,
      buriedUntil: null,
      createdAt: ts,
      updatedAt: ts,
    });
  }
  return { upserts, deletes };
}

export interface CardFace {
  kind: 'text' | 'cloze' | 'occlusion';
  promptHtml: string;
  answerHtml: string;
  /** Plain answer text for typing, choices and games. */
  answerText: string;
  promptText: string;
  clozeNumber?: number;
  maskGroup?: number;
  imageSide?: 'front' | 'back' | null;
}

export function faceFor(note: Note, card: Card): CardFace {
  if (note.type === 'cloze') {
    const n = Number(card.ord.slice(1));
    return {
      kind: 'cloze',
      promptHtml: renderCloze(note.front, n, false),
      answerHtml: renderCloze(note.front, n, true),
      promptText: stripHtml(renderCloze(note.front, n, false)),
      answerText: stripHtml(clozeAnswer(note.front, n)),
      clozeNumber: n,
      imageSide: note.image ? note.image.side : null,
    };
  }
  if (note.type === 'occlusion') {
    const g = Number(card.ord.slice(1));
    const labels = (note.image?.masks || []).filter((m) => m.group === g).map((m) => m.label).filter(Boolean);
    return {
      kind: 'occlusion',
      promptHtml: note.front,
      answerHtml: note.back,
      promptText: stripHtml(note.front),
      answerText: labels.join(', ') || stripHtml(note.back),
      maskGroup: g,
      imageSide: 'front',
    };
  }
  const reversed = note.type === 'reverse' && card.ord === '1';
  const promptHtml = reversed ? note.back : note.front;
  const answerHtml = reversed ? note.front : note.back;
  let imageSide = note.image ? note.image.side : null;
  if (reversed && imageSide) imageSide = imageSide === 'front' ? 'back' : 'front';
  return {
    kind: 'text',
    promptHtml,
    answerHtml,
    promptText: stripHtml(promptHtml),
    answerText: stripHtml(answerHtml),
    imageSide,
  };
}

export function noteTitle(note: Note): string {
  const t = stripHtml(note.type === 'cloze' ? renderCloze(note.front, null, true) : note.front);
  if (t) return t.length > 80 ? t.slice(0, 78) + '...' : t;
  if (note.type === 'occlusion') {
    const labels = (note.image?.masks || []).map((m) => m.label).filter(Boolean);
    if (labels.length) return labels.slice(0, 3).join(', ') + (labels.length > 3 ? '...' : '');
  }
  const b = stripHtml(note.back);
  if (b) return b.length > 80 ? b.slice(0, 78) + '...' : b;
  return '';
}
