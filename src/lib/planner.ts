import type { Deck, Library } from './types';
import { cardsInDecks, deckDescendants, newIntroducedToday, statusOf } from './srs';
import { dayKey, daysBetween } from './util';

export interface ExamPlan {
  deck: Deck;
  daysLeft: number;
  newLeft: number;
  notMastered: number;
  total: number;
  /** New cards per day needed to see everything with 2 days spare for revision. */
  neededPerDay: number;
  doneToday: number;
  status: 'ahead' | 'on-track' | 'behind' | 'past';
  readiness: number; // 0..1, share of cards past the learning stage
}

export function examPlan(lib: Library, deck: Deck, ts = Date.now()): ExamPlan | null {
  if (!deck.examDate) return null;
  const daysLeft = daysBetween(dayKey(ts), deck.examDate);
  const ids = deckDescendants(lib, deck.id);
  const cards = cardsInDecks(lib, ids).filter((c) => !c.suspended);
  const newLeft = cards.filter((c) => c.srs.state === 0).length;
  const solid = cards.filter((c) => ['review', 'mastered', 'due'].includes(statusOf(c, ts)) && c.srs.state === 2).length;
  const studyDays = Math.max(1, daysLeft - 2);
  const neededPerDay = newLeft === 0 ? 0 : Math.ceil(newLeft / studyDays);
  const doneToday = newIntroducedToday(lib, ids, ts);
  let status: ExamPlan['status'] = 'on-track';
  if (daysLeft < 0) status = 'past';
  else if (newLeft === 0) status = 'ahead';
  else if (deck.newPerDay < neededPerDay) status = 'behind';
  return {
    deck,
    daysLeft,
    newLeft,
    notMastered: cards.length - solid,
    total: cards.length,
    neededPerDay,
    doneToday,
    status,
    readiness: cards.length ? solid / cards.length : 0,
  };
}

export function allExamPlans(lib: Library, ts = Date.now()): ExamPlan[] {
  return Object.values(lib.decks)
    .map((d) => examPlan(lib, d, ts))
    .filter((p): p is ExamPlan => !!p && p.daysLeft >= -1)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
