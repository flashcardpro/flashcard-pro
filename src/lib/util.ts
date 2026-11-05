import type { Deck, DeckColor, Library, Profile, Settings } from './types';

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export const now = () => Date.now();

/** A study day starts at 4 AM local time, like Anki, so late-night study counts for the same day. */
export const DAY_START_HOUR = 4;

export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts - DAY_START_HOUR * 3600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function startOfStudyDay(ts: number = Date.now()): number {
  const d = new Date(ts - DAY_START_HOUR * 3600_000);
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  return d.getTime();
}

export function endOfStudyDay(ts: number = Date.now()): number {
  return startOfStudyDay(ts) + 86_400_000;
}

export function daysBetween(fromKey: string, toKey: string): number {
  const a = new Date(fromKey + 'T12:00:00');
  const b = new Date(toKey + 'T12:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addDaysKey(key: string, n: number): string {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatInterval(ms: number, lang: 'en' | 'hi' = 'en'): string {
  const m = ms / 60_000;
  const unit = (en: string, hi: string) => (lang === 'hi' ? hi : en);
  if (m < 1) return '<1' + unit('m', ' मि');
  if (m < 60) return Math.round(m) + unit('m', ' मि');
  const h = m / 60;
  if (h < 24) return Math.round(h) + unit('h', ' घं');
  const d = h / 24;
  if (d < 30) return Math.round(d) + unit('d', ' दि');
  const mo = d / 30;
  if (mo < 12) return (mo < 10 ? mo.toFixed(1).replace(/\.0$/, '') : Math.round(mo)) + unit('mo', ' मा');
  return (d / 365).toFixed(1).replace(/\.0$/, '') + unit('y', ' व');
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function stripHtml(html: string): string {
  if (!html) return '';
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h\d)>/gi, ' ')
    .replace(/\{\{c\d+::([\s\S]*?)(::[\s\S]*?)?\}\}/g, '$1');
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.innerHTML = withBreaks.replace(/<img[^>]*>/gi, ' ');
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }
  return withBreaks.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function debounce<T extends (...a: any[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const d = (...a: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = () => {
    if (t) {
      clearTimeout(t);
      t = undefined;
      fn();
    }
  };
  return d as T & { flush: () => void };
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[‘’“”]/g, "'")
    .replace(/[.,;:!?()[\]{}"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 'exact' | 'close' (typo) | 'wrong' */
export function gradeAnswer(given: string, expected: string): 'exact' | 'close' | 'wrong' {
  const g = normalizeAnswer(given);
  const e = normalizeAnswer(expected);
  if (!g) return 'wrong';
  if (g === e) return 'exact';
  // accept any of several answers separated by "/" or ","
  const options = expected.split(/[\/,;]| or /).map(normalizeAnswer).filter(Boolean);
  if (options.includes(g)) return 'exact';
  const tol = (len: number) => (len < 4 ? 0 : len < 8 ? 1 : Math.max(2, Math.floor(len * 0.15)));
  if (levenshtein(g, e) <= tol(e.length)) return 'close';
  if (options.some((o) => levenshtein(g, o) <= tol(o.length))) return 'close';
  return 'wrong';
}

export function defaultSettings(): Settings {
  return {
    language: 'en',
    theme: 'system',
    ratingStyle: 'four',
    retention: 0.9,
    maskColor: '#2B55E6',
    targetColor: '#E5484D',
    ttsVoice: '',
    ttsRate: 1,
    ttsAuto: false,
    focusMinutes: 25,
    breakMinutes: 5,
    remindersOn: false,
    reminderTime: '19:00',
    dailyGoal: 50,
    buttonTimes: {
      1: { mode: 'auto', amount: 10, unit: 'min' },
      2: { mode: 'auto', amount: 1, unit: 'day' },
      3: { mode: 'auto', amount: 3, unit: 'day' },
      4: { mode: 'auto', amount: 7, unit: 'day' },
    },
    showCustomButton: true,
    customDays: [2, 5, 10, 30],
    updatedAt: 0,
  };
}

export function defaultProfile(): Profile {
  return { badges: {}, xpEvents: {}, matchBest: {}, gravityBest: 0, updatedAt: 0 };
}

export function emptyLibrary(): Library {
  return {
    schema: 1,
    decks: {},
    notes: {},
    cards: {},
    reviews: {},
    media: {},
    tombstones: {},
    settings: defaultSettings(),
    profile: defaultProfile(),
    resume: { route: '/', session: null, updatedAt: 0 },
  };
}

export function newDeck(name: string, color: DeckColor = 'blue', parentId: string | null = null, order = 0): Deck {
  const t = now();
  return {
    id: uid(),
    name,
    parentId,
    color,
    description: '',
    examDate: null,
    newPerDay: 20,
    reviewsPerDay: 200,
    ttsLang: '',
    order,
    createdAt: t,
    updatedAt: t,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFileName(s: string) {
  return s.replace(/[^a-z0-9ऀ-ॿ _-]+/gi, '').trim().replace(/\s+/g, '-') || 'deck';
}
