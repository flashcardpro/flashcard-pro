import type { Library, Rating } from './types';
import { dayKey, startOfStudyDay, addDaysKey } from './util';
import { statusOf } from './srs';

export const REVIEW_XP: Record<Rating, number> = { 1: 2, 2: 6, 3: 10, 4: 12 };

export function totalXp(lib: Library): number {
  let xp = 0;
  for (const r of Object.values(lib.reviews)) xp += REVIEW_XP[r.rating] ?? 0;
  for (const e of Object.values(lib.profile.xpEvents)) xp += e.amount;
  return xp;
}

export function xpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export function levelInfo(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return { level, floor, ceil, progress: (xp - floor) / (ceil - floor), toNext: ceil - xp };
}

export function streak(lib: Library, ts = Date.now()): { current: number; best: number; studiedToday: boolean } {
  const days = new Set<string>();
  for (const r of Object.values(lib.reviews)) days.add(dayKey(r.ts));
  const today = dayKey(ts);
  const studiedToday = days.has(today);
  let cur = 0;
  let k = studiedToday ? today : addDaysKey(today, -1);
  while (days.has(k)) {
    cur++;
    k = addDaysKey(k, -1);
  }
  let best = 0;
  const sorted = [...days].sort();
  let run = 0;
  let prev = '';
  for (const d of sorted) {
    run = prev && addDaysKey(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current: cur, best: Math.max(best, cur), studiedToday };
}

export interface BadgeDef {
  id: string;
  icon: string;
  title: string;
  desc: string;
  test: (s: Stats) => boolean;
}

export interface Stats {
  reviews: number;
  bestDay: number;
  streakBest: number;
  photos: number;
  cloze: number;
  masks: number;
  mastered: number;
  nightOwl: boolean;
  earlyBird: boolean;
  matchBest: number;
  gravityBest: number;
  events: Record<string, number>;
  examSet: boolean;
  audio: number;
}

export function computeStats(lib: Library): Stats {
  const perDay = new Map<string, number>();
  let nightOwl = false;
  let earlyBird = false;
  for (const r of Object.values(lib.reviews)) {
    const k = dayKey(r.ts);
    perDay.set(k, (perDay.get(k) || 0) + 1);
    const h = new Date(r.ts).getHours();
    if (h >= 0 && h < 4) nightOwl = true;
    if (h >= 4 && h < 7) earlyBird = true;
  }
  const events: Record<string, number> = {};
  for (const e of Object.values(lib.profile.xpEvents)) {
    const key = e.reason.split(':')[0];
    events[key] = (events[key] || 0) + 1;
  }
  const notes = Object.values(lib.notes);
  return {
    reviews: Object.keys(lib.reviews).length,
    bestDay: Math.max(0, ...perDay.values()),
    streakBest: streak(lib).best,
    photos: Object.values(lib.media).filter((m) => m.mime.startsWith('image/')).length,
    audio: Object.values(lib.media).filter((m) => m.mime.startsWith('audio/')).length,
    cloze: notes.filter((n) => n.type === 'cloze').length,
    masks: notes.reduce((a, n) => a + (n.image?.masks.length || 0), 0),
    mastered: Object.values(lib.cards).filter((c) => statusOf(c) === 'mastered').length,
    nightOwl,
    earlyBird,
    matchBest: Math.min(Infinity, ...Object.values(lib.profile.matchBest)),
    gravityBest: lib.profile.gravityBest,
    events,
    examSet: Object.values(lib.decks).some((d) => !!d.examDate),
  };
}

export const BADGES: BadgeDef[] = [
  { id: 'first-review', icon: 'Sparkles', title: 'First flip', desc: 'Finish your first review', test: (s) => s.reviews >= 1 },
  { id: 'reviews-100', icon: 'Layers', title: 'Hundred club', desc: 'Finish 100 reviews', test: (s) => s.reviews >= 100 },
  { id: 'reviews-1000', icon: 'Library', title: 'Thousand flips', desc: 'Finish 1,000 reviews', test: (s) => s.reviews >= 1000 },
  { id: 'day-100', icon: 'Zap', title: 'Century day', desc: 'Do 100 reviews in one day', test: (s) => s.bestDay >= 100 },
  { id: 'streak-3', icon: 'Flame', title: 'Warming up', desc: 'Study 3 days in a row', test: (s) => s.streakBest >= 3 },
  { id: 'streak-7', icon: 'Flame', title: 'One full week', desc: 'Study 7 days in a row', test: (s) => s.streakBest >= 7 },
  { id: 'streak-30', icon: 'Flame', title: 'Habit formed', desc: 'Study 30 days in a row', test: (s) => s.streakBest >= 30 },
  { id: 'streak-100', icon: 'Crown', title: 'Unstoppable', desc: 'Study 100 days in a row', test: (s) => s.streakBest >= 100 },
  { id: 'photos-10', icon: 'Camera', title: 'Shutterbug', desc: 'Add 10 photos', test: (s) => s.photos >= 10 },
  { id: 'photos-100', icon: 'Images', title: 'Photo archivist', desc: 'Add 100 photos', test: (s) => s.photos >= 100 },
  { id: 'masks-50', icon: 'EyeOff', title: 'Mask maker', desc: 'Hide 50 parts of photos', test: (s) => s.masks >= 50 },
  { id: 'cloze-10', icon: 'Brackets', title: 'Gap filler', desc: 'Make 10 fill-in-the-blank notes', test: (s) => s.cloze >= 10 },
  { id: 'voice', icon: 'Mic', title: 'Say it out loud', desc: 'Record a voice note', test: (s) => s.audio >= 1 },
  { id: 'mastered-50', icon: 'BadgeCheck', title: 'Steady memory', desc: 'Master 50 cards', test: (s) => s.mastered >= 50 },
  { id: 'mastered-500', icon: 'Brain', title: 'Long-term memory', desc: 'Master 500 cards', test: (s) => s.mastered >= 500 },
  { id: 'night-owl', icon: 'Moon', title: 'Night owl', desc: 'Review between midnight and 4 AM', test: (s) => s.nightOwl },
  { id: 'early-bird', icon: 'Sunrise', title: 'Early bird', desc: 'Review between 4 and 7 AM', test: (s) => s.earlyBird },
  { id: 'match-fast', icon: 'Timer', title: 'Quick matcher', desc: 'Finish Match in under 20 seconds', test: (s) => s.matchBest < 20_000 },
  { id: 'gravity-500', icon: 'Rocket', title: 'Gravity defier', desc: 'Score 500 in Gravity', test: (s) => s.gravityBest >= 500 },
  { id: 'focus-4', icon: 'Hourglass', title: 'Deep focus', desc: 'Complete 4 focus sessions', test: (s) => (s.events.focus || 0) >= 4 },
  { id: 'goal-7', icon: 'Target', title: 'Goal getter', desc: 'Hit your daily goal 7 times', test: (s) => (s.events.goal || 0) >= 7 },
  { id: 'exam-set', icon: 'CalendarClock', title: 'Planner', desc: 'Set an exam date for a deck', test: (s) => s.examSet },
  { id: 'sharer', icon: 'Share2', title: 'Study buddy', desc: 'Share a deck by link', test: (s) => (s.events.share || 0) >= 1 },
  { id: 'importer', icon: 'Import', title: 'Bring it in', desc: 'Import a deck', test: (s) => (s.events.import || 0) >= 1 },
];

export function newlyEarned(lib: Library): string[] {
  const s = computeStats(lib);
  return BADGES.filter((b) => !lib.profile.badges[b.id] && b.test(s)).map((b) => b.id);
}

export function todayReviews(lib: Library, ts = Date.now()): number {
  const start = startOfStudyDay(ts);
  let n = 0;
  for (const r of Object.values(lib.reviews)) if (r.ts >= start) n++;
  return n;
}
