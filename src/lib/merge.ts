import type { Library, Profile } from './types';
import { defaultProfile, defaultSettings, emptyLibrary } from './util';

type Stamped = { updatedAt: number };

function mergeEntities<T extends Stamped>(a: Record<string, T>, b: Record<string, T>, tomb: Record<string, number>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const src of [a, b]) {
    for (const [id, v] of Object.entries(src || {})) {
      const cur = out[id];
      if (!cur || (v.updatedAt ?? 0) > (cur.updatedAt ?? 0)) out[id] = v;
    }
  }
  for (const [id, deletedAt] of Object.entries(tomb)) {
    if (out[id] && (out[id].updatedAt ?? 0) <= deletedAt) delete out[id];
  }
  return out;
}

function mergeProfile(a: Profile, b: Profile): Profile {
  const base = (a.updatedAt ?? 0) >= (b.updatedAt ?? 0) ? a : b;
  const badges: Record<string, number> = { ...b.badges };
  for (const [k, v] of Object.entries(a.badges || {})) badges[k] = badges[k] ? Math.min(badges[k], v) : v;
  const matchBest: Record<string, number> = { ...b.matchBest };
  for (const [k, v] of Object.entries(a.matchBest || {})) matchBest[k] = matchBest[k] ? Math.min(matchBest[k], v) : v;
  return {
    ...defaultProfile(),
    ...base,
    badges,
    matchBest,
    xpEvents: { ...(b.xpEvents || {}), ...(a.xpEvents || {}) },
    gravityBest: Math.max(a.gravityBest || 0, b.gravityBest || 0),
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
  };
}

/** Merges two libraries. Newest edit wins per item, deletions win over older edits, history is unioned. */
export function mergeLibraries(local: Library | undefined, remote: Library | undefined): Library {
  const a = normalizeLibrary(local);
  const b = normalizeLibrary(remote);
  const tombstones: Record<string, number> = { ...b.tombstones };
  for (const [k, v] of Object.entries(a.tombstones)) tombstones[k] = Math.max(tombstones[k] || 0, v);
  // Forget very old tombstones (90 days) to keep the file small.
  const cutoff = Date.now() - 90 * 86_400_000;
  for (const [k, v] of Object.entries(tombstones)) if (v < cutoff) delete tombstones[k];

  const reviews = { ...b.reviews, ...a.reviews };
  for (const id of Object.keys(reviews)) if (tombstones[id]) delete reviews[id];

  return {
    schema: 1,
    decks: mergeEntities(a.decks, b.decks, tombstones),
    notes: mergeEntities(a.notes, b.notes, tombstones),
    cards: mergeEntities(a.cards, b.cards, tombstones),
    media: mergeEntities(a.media, b.media, tombstones),
    reviews,
    tombstones,
    settings: (a.settings.updatedAt ?? 0) >= (b.settings.updatedAt ?? 0) ? a.settings : b.settings,
    profile: mergeProfile(a.profile, b.profile),
    resume: (a.resume.updatedAt ?? 0) >= (b.resume.updatedAt ?? 0) ? a.resume : b.resume,
  };
}

/** Fills missing fields so older or partial files load safely. */
export function normalizeLibrary(lib: Partial<Library> | undefined | null): Library {
  const e = emptyLibrary();
  if (!lib || typeof lib !== 'object') return e;
  return {
    schema: 1,
    decks: lib.decks || {},
    notes: lib.notes || {},
    cards: lib.cards || {},
    reviews: lib.reviews || {},
    media: lib.media || {},
    tombstones: lib.tombstones || {},
    settings: { ...defaultSettings(), ...(lib.settings || {}) },
    profile: { ...defaultProfile(), ...(lib.profile || {}) },
    resume: { ...e.resume, ...(lib.resume || {}) },
  };
}

export function isLibraryEmpty(lib: Library): boolean {
  return Object.keys(lib.notes).length === 0 && Object.keys(lib.decks).length === 0;
}
