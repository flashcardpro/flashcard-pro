import { createEmptyCard, fsrs, generatorParameters, Rating as FR, type Card as FCard, type FSRS } from 'ts-fsrs';
import type { Card, CardStatus, Deck, Library, Rating, SrsState } from './types';
import { DAY_START_HOUR, dayKey, endOfStudyDay, startOfStudyDay } from './util';

const MASTERED_DAYS = 21;
const LEARN_AHEAD_MS = 20 * 60_000;

let cached: { retention: number; f: FSRS } | null = null;
function scheduler(retention = 0.9): FSRS {
  if (!cached || cached.retention !== retention) {
    cached = { retention, f: fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true, enable_short_term: true })) };
  }
  return cached.f;
}

export function emptySrs(ts = Date.now()): SrsState {
  return fromF(createEmptyCard(new Date(ts)));
}

function toF(s: SrsState): FCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as FCard;
}

function fromF(c: FCard): SrsState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as SrsState['state'],
    last_review: c.last_review ? new Date(c.last_review).getTime() : null,
  };
}

const RATING_MAP: Record<Rating, FR.Again | FR.Hard | FR.Good | FR.Easy> = {
  1: FR.Again,
  2: FR.Hard,
  3: FR.Good,
  4: FR.Easy,
};

export function review(s: SrsState, rating: Rating, ts = Date.now(), retention = 0.9): SrsState {
  const res = scheduler(retention).next(toF(s), new Date(ts), RATING_MAP[rating]);
  return fromF(res.card);
}

/**
 * The learner picks the day the card comes back (the Custom button).
 * Memory is updated as if they answered Good, then the next review is moved to that day.
 */
export function reviewOnDate(s: SrsState, dueAt: number, ts = Date.now(), retention = 0.9): SrsState {
  const good = review(s, 3, ts, retention);
  const days = Math.max(1, Math.round((dueAt - ts) / 86_400_000));
  return { ...good, state: 2, learning_steps: 0, due: dueAt, scheduled_days: days };
}

/** The start (4 AM) of the study day `days` days from now. */
export function dueInDays(days: number, ts = Date.now()): number {
  const d = new Date(startOfStudyDay(ts));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** The start (4 AM) of a calendar date given as YYYY-MM-DD. */
export function dueOnDate(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, DAY_START_HOUR).getTime();
}

/** Interval (ms from now) each rating would give. */
export function preview(s: SrsState, ts = Date.now(), retention = 0.9): Record<Rating, number> {
  const r = scheduler(retention).repeat(toF(s), new Date(ts));
  return {
    1: r[FR.Again].card.due.getTime() - ts,
    2: r[FR.Hard].card.due.getTime() - ts,
    3: r[FR.Good].card.due.getTime() - ts,
    4: r[FR.Easy].card.due.getTime() - ts,
  };
}

export function retrievability(s: SrsState, ts = Date.now()): number {
  if (s.state === 0) return 0;
  return scheduler().get_retrievability(toF(s), new Date(ts), false);
}

/** Confidence 1..5 (Brainscape style) mapped to FSRS ratings. */
export function confidenceToRating(c: 1 | 2 | 3 | 4 | 5): Rating {
  return ([1, 1, 2, 3, 3, 4] as Rating[])[c];
}

export function statusOf(card: Card, ts = Date.now()): CardStatus {
  if (card.suspended) return 'suspended';
  const s = card.srs;
  if (s.state === 0) return 'new';
  if (s.state === 1 || s.state === 3) return 'learning';
  if (s.due <= endOfStudyDay(ts)) return 'due';
  if (s.scheduled_days >= MASTERED_DAYS || s.stability >= MASTERED_DAYS) return 'mastered';
  return 'review';
}

export function isBuried(card: Card, ts = Date.now()) {
  return card.buriedUntil != null && card.buriedUntil > ts;
}

export function deckDescendants(lib: Library, deckId: string): string[] {
  const out = [deckId];
  const kids = new Map<string, string[]>();
  for (const d of Object.values(lib.decks)) {
    if (d.parentId) {
      if (!kids.has(d.parentId)) kids.set(d.parentId, []);
      kids.get(d.parentId)!.push(d.id);
    }
  }
  for (let i = 0; i < out.length; i++) for (const k of kids.get(out[i]) || []) out.push(k);
  return out;
}

export function cardsInDecks(lib: Library, deckIds: string[]): Card[] {
  const set = new Set(deckIds);
  return Object.values(lib.cards).filter((c) => set.has(c.deckId) && lib.notes[c.noteId]);
}

export interface DeckCounts {
  total: number;
  new: number;
  learning: number;
  due: number;
  review: number;
  mastered: number;
  suspended: number;
  dueNow: number; // cards available to study right now (respecting limits)
}

export function newIntroducedToday(lib: Library, deckIds: string[], ts = Date.now()): number {
  const start = startOfStudyDay(ts);
  const set = new Set(deckIds);
  let n = 0;
  for (const r of Object.values(lib.reviews)) if (r.ts >= start && r.prevState === 0 && set.has(r.deckId)) n++;
  return n;
}

export function reviewsDoneToday(lib: Library, deckIds?: string[], ts = Date.now()): number {
  const start = startOfStudyDay(ts);
  const set = deckIds ? new Set(deckIds) : null;
  let n = 0;
  for (const r of Object.values(lib.reviews)) if (r.ts >= start && (!set || set.has(r.deckId))) n++;
  return n;
}

export function deckCounts(lib: Library, deckId: string, ts = Date.now()): DeckCounts {
  const ids = deckDescendants(lib, deckId);
  const counts: DeckCounts = { total: 0, new: 0, learning: 0, due: 0, review: 0, mastered: 0, suspended: 0, dueNow: 0 };
  for (const c of cardsInDecks(lib, ids)) {
    counts.total++;
    counts[statusOf(c, ts)]++;
  }
  counts.dueNow = buildQueue(lib, deckId, ts).length;
  return counts;
}

/** Builds today's review queue: learning first, then reviews interleaved with new cards. */
export function buildQueue(lib: Library, deckId: string | null, ts = Date.now()): string[] {
  const ids = deckId ? deckDescendants(lib, deckId) : Object.keys(lib.decks);
  const root: Deck | undefined = deckId ? lib.decks[deckId] : undefined;
  const cards = cardsInDecks(lib, ids).filter((c) => !c.suspended && !isBuried(c, ts));
  const dayEnd = endOfStudyDay(ts);
  const learning = cards.filter((c) => (c.srs.state === 1 || c.srs.state === 3) && c.srs.due <= ts + LEARN_AHEAD_MS).sort((a, b) => a.srs.due - b.srs.due);
  const reviewLimit = root?.reviewsPerDay ?? 9999;
  const reviews = cards
    .filter((c) => c.srs.state === 2 && c.srs.due <= dayEnd)
    .sort((a, b) => a.srs.due - b.srs.due)
    .slice(0, Math.max(0, reviewLimit - Math.max(0, reviewsDoneToday(lib, ids, ts) - newIntroducedToday(lib, ids, ts))));

  // New cards: each deck's own limit applies, and the root deck limit caps the total.
  const usedByDeck = new Map<string, number>();
  const start = startOfStudyDay(ts);
  for (const r of Object.values(lib.reviews)) if (r.ts >= start && r.prevState === 0) usedByDeck.set(r.deckId, (usedByDeck.get(r.deckId) || 0) + 1);
  const newCards: Card[] = [];
  const perDeckTaken = new Map<string, number>();
  const sortedNew = cards
    .filter((c) => c.srs.state === 0)
    .sort((a, b) => (lib.notes[a.noteId]?.createdAt ?? 0) - (lib.notes[b.noteId]?.createdAt ?? 0) || a.ord.localeCompare(b.ord, undefined, { numeric: true }));
  const rootLimit = root ? Math.max(0, root.newPerDay - newIntroducedToday(lib, ids, ts)) : 9999;
  for (const c of sortedNew) {
    if (newCards.length >= rootLimit) break;
    const d = lib.decks[c.deckId];
    const lim = d ? d.newPerDay : 20;
    const taken = (usedByDeck.get(c.deckId) || 0) + (perDeckTaken.get(c.deckId) || 0);
    if (taken >= lim) continue;
    perDeckTaken.set(c.deckId, (perDeckTaken.get(c.deckId) || 0) + 1);
    newCards.push(c);
  }
  // Interleave one new card after every few reviews.
  const mixed: Card[] = [];
  const gap = newCards.length ? Math.max(1, Math.floor(reviews.length / newCards.length)) : 0;
  let ni = 0;
  reviews.forEach((r, i) => {
    mixed.push(r);
    if (gap && (i + 1) % gap === 0 && ni < newCards.length) mixed.push(newCards[ni++]);
  });
  while (ni < newCards.length) mixed.push(newCards[ni++]);
  return [...learning, ...mixed].map((c) => c.id);
}

export function forecast(lib: Library, deckIds: string[] | null, days = 14, ts = Date.now()): number[] {
  const out = new Array(days).fill(0);
  const cards = deckIds ? cardsInDecks(lib, deckIds) : Object.values(lib.cards);
  const start = startOfStudyDay(ts);
  for (const c of cards) {
    if (c.suspended || c.srs.state === 0) continue;
    const idx = Math.max(0, Math.floor((c.srs.due - start) / 86_400_000));
    if (idx < days) out[idx]++;
  }
  return out;
}

export function studyDays(lib: Library): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of Object.values(lib.reviews)) {
    const k = dayKey(r.ts);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
