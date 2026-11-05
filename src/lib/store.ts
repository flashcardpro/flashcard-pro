import { create } from 'zustand';
import type { Card, Deck, DeckColor, Library, MediaMeta, Note, NoteType, Rating, Settings } from './types';
import { emptyLibrary, newDeck, now, uid, debounce, dayKey } from './util';
import { GUEST_KEY, loadLibrary, putMediaBlob, saveLibrary } from './db';
import { normalizeLibrary } from './merge';
import { syncCardsForNote } from './cards';
import { scheduleRating, reviewOnDate, emptySrs, deckDescendants, moveDue, relearn } from './srs';
import { newlyEarned, levelInfo, totalXp, todayReviews } from './gamify';
import { emit } from './events';
import { prepareImage } from './image';
import { tNow } from './i18n';

export interface GoogleUser {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

export type SyncStatus = 'local' | 'idle' | 'syncing' | 'synced' | 'paused' | 'error' | 'offline';

interface StoreState {
  ready: boolean;
  userKey: string;
  user: GoogleUser | null;
  lib: Library;
  dirty: boolean;
  syncStatus: SyncStatus;
  syncError: string;
  lastSyncedAt: number;
  init: (userKey?: string) => Promise<void>;
  replaceLibrary: (lib: Library, opts?: { dirty?: boolean }) => void;
  mutate: (fn: (lib: Library) => void, opts?: { dirty?: boolean }) => void;
  setUser: (u: GoogleUser | null) => void;
  setSync: (s: Partial<Pick<StoreState, 'syncStatus' | 'syncError' | 'lastSyncedAt' | 'dirty'>>) => void;
}

const persist = debounce(() => {
  const { userKey, lib, ready } = useStore.getState();
  if (ready) saveLibrary(userKey, lib).catch((e) => console.error('Local save failed', e));
}, 350);

export const flushLocalSave = () => persist.flush();

export const useStore = create<StoreState>((set, get) => ({
  ready: false,
  userKey: GUEST_KEY,
  user: null,
  lib: emptyLibrary(),
  dirty: false,
  syncStatus: 'local',
  syncError: '',
  lastSyncedAt: 0,
  async init(userKey = GUEST_KEY) {
    persist.flush();
    const stored = await loadLibrary(userKey);
    const lib = normalizeLibrary(stored);
    set({ userKey, lib, ready: true, dirty: false });
    emit('libraryReplaced', undefined);
  },
  replaceLibrary(lib, opts) {
    set({ lib, dirty: opts?.dirty ?? get().dirty });
    persist();
    emit('libraryReplaced', undefined);
  },
  mutate(fn, opts) {
    const before = get().lib;
    const draft: Library = { ...before };
    fn(draft);
    set({ lib: draft, dirty: opts?.dirty === false ? get().dirty : true });
    persist();
  },
  setUser(u) {
    set({ user: u });
  },
  setSync(s) {
    set(s);
  },
}));

export const getLib = () => useStore.getState().lib;

// ---------- helpers that keep maps immutable ----------
function putAll<K extends 'decks' | 'notes' | 'cards' | 'media' | 'reviews'>(lib: Library, key: K, items: Library[K][string][]) {
  if (!items.length) return;
  const map = { ...(lib[key] as Record<string, unknown>) };
  for (const it of items) map[(it as { id: string }).id] = it;
  (lib as any)[key] = map;
}

function removeAll(lib: Library, key: 'decks' | 'notes' | 'cards' | 'media' | 'reviews', ids: string[]) {
  if (!ids.length) return;
  const map = { ...(lib[key] as Record<string, unknown>) };
  const tomb = { ...lib.tombstones };
  const t = now();
  for (const id of ids) {
    delete map[id];
    tomb[id] = t;
  }
  (lib as any)[key] = map;
  lib.tombstones = tomb;
}

// ---------- decks ----------
export function createDeck(name: string, color: DeckColor = 'blue', parentId: string | null = null): Deck {
  const order = Object.keys(getLib().decks).length;
  const d = newDeck(name.trim() || tNow('Untitled deck'), color, parentId, order);
  useStore.getState().mutate((lib) => putAll(lib, 'decks', [d]));
  return d;
}

export function updateDeck(id: string, patch: Partial<Deck>) {
  useStore.getState().mutate((lib) => {
    const d = lib.decks[id];
    if (d) putAll(lib, 'decks', [{ ...d, ...patch, updatedAt: now() }]);
  });
  if (patch.examDate) checkBadges();
}

export function deleteDeck(id: string) {
  useStore.getState().mutate((lib) => {
    const ids = deckDescendants(lib, id);
    const set = new Set(ids);
    const notes = Object.values(lib.notes).filter((n) => set.has(n.deckId)).map((n) => n.id);
    const noteSet = new Set(notes);
    const cards = Object.values(lib.cards).filter((c) => noteSet.has(c.noteId)).map((c) => c.id);
    removeAll(lib, 'cards', cards);
    removeAll(lib, 'notes', notes);
    removeAll(lib, 'decks', ids);
  });
}

export function ensureDefaultDeck(): Deck {
  const decks = Object.values(getLib().decks);
  if (decks.length) return decks.sort((a, b) => a.order - b.order)[0];
  return createDeck(tNow('My first deck'), 'blue');
}

// ---------- media ----------
export async function addImageMedia(file: Blob, name = ''): Promise<MediaMeta> {
  const prepared = await prepareImage(file);
  return addMediaBlob(prepared.blob, { width: prepared.width, height: prepared.height, name });
}

export async function addMediaBlob(blob: Blob, extra: Partial<MediaMeta> = {}): Promise<MediaMeta> {
  const id = uid();
  await putMediaBlob(id, blob);
  const t = now();
  const meta: MediaMeta = { id, mime: blob.type || 'application/octet-stream', size: blob.size, driveId: null, createdAt: t, updatedAt: t, ...extra };
  useStore.getState().mutate((lib) => putAll(lib, 'media', [meta]));
  return meta;
}

export function setMediaDriveId(id: string, driveId: string) {
  useStore.getState().mutate((lib) => {
    const m = lib.media[id];
    if (m) putAll(lib, 'media', [{ ...m, driveId, updatedAt: now() }]);
  });
}

// ---------- notes ----------
export function blankNote(deckId: string, type: NoteType = 'basic'): Note {
  const t = now();
  return {
    id: uid(),
    deckId,
    type,
    front: '',
    back: '',
    extra: '',
    image: null,
    audioFront: null,
    audioBack: null,
    tags: [],
    flag: null,
    createdAt: t,
    updatedAt: t,
  };
}

export function saveNote(note: Note) {
  const saved = { ...note, updatedAt: now() };
  useStore.getState().mutate((lib) => {
    putAll(lib, 'notes', [saved]);
    const { upserts, deletes } = syncCardsForNote(lib, saved);
    putAll(lib, 'cards', upserts);
    removeAll(lib, 'cards', deletes);
  });
  checkBadges();
  return saved;
}

export function saveNotes(notes: Note[]) {
  const t = now();
  useStore.getState().mutate((lib) => {
    const saved = notes.map((n) => ({ ...n, updatedAt: t }));
    putAll(lib, 'notes', saved);
    for (const n of saved) {
      const { upserts, deletes } = syncCardsForNote(lib, n, t);
      putAll(lib, 'cards', upserts);
      removeAll(lib, 'cards', deletes);
    }
  });
  checkBadges();
}

export function deleteNotes(ids: string[]) {
  useStore.getState().mutate((lib) => {
    const set = new Set(ids);
    removeAll(
      lib,
      'cards',
      Object.values(lib.cards)
        .filter((c) => set.has(c.noteId))
        .map((c) => c.id),
    );
    removeAll(lib, 'notes', ids);
  });
}

export function moveNotes(ids: string[], deckId: string) {
  const lib = getLib();
  saveNotes(ids.map((id) => lib.notes[id]).filter(Boolean).map((n) => ({ ...n, deckId })));
}

export function setNotesFlag(ids: string[], flag: Note['flag']) {
  const lib = getLib();
  saveNotes(ids.map((id) => lib.notes[id]).filter(Boolean).map((n) => ({ ...n, flag })));
}

// ---------- cards ----------
export function updateCards(ids: string[], patch: (c: Card) => Partial<Card>) {
  useStore.getState().mutate((lib) => {
    const t = now();
    putAll(
      lib,
      'cards',
      ids.map((id) => lib.cards[id]).filter(Boolean).map((c) => ({ ...c, ...patch(c), updatedAt: t })),
    );
  });
}

export function resetCards(ids: string[]) {
  updateCards(ids, () => ({ srs: emptySrs(), suspended: false, buriedUntil: null }));
}

/** Study again: back into today's learning, as if forgotten. Not counted as a review. */
export function relearnCards(ids: string[]) {
  const t = now();
  const ret = getLib().settings.retention;
  updateCards(ids, (c) => ({ srs: relearn(c.srs, t, ret), suspended: false, buriedUntil: null }));
}

/** Study again on a chosen day. Not counted as a review. */
export function moveCardsTo(ids: string[], dueAt: number) {
  const t = now();
  const ret = getLib().settings.retention;
  updateCards(ids, (c) => ({ srs: moveDue(c.srs, dueAt, t, ret), suspended: false, buriedUntil: null }));
}

/** Rates a card. With `dueAt`, the learner chose the day it comes back (counted as Good). */
export function rateCard(cardId: string, rating: Rating, ms: number, dueAt?: number): { before: Card; logId: string } | null {
  const lib = getLib();
  const card = lib.cards[cardId];
  if (!card) return null;
  const t = now();
  const levelBefore = levelInfo(totalXp(lib)).level;
  const reviewsBefore = todayReviews(lib, t);
  const srs = dueAt ? reviewOnDate(card.srs, dueAt, t, lib.settings.retention) : scheduleRating(card.srs, rating, t, lib.settings.retention, lib.settings.buttonTimes);
  const logId = uid();
  useStore.getState().mutate((l) => {
    putAll(l, 'cards', [{ ...card, srs, updatedAt: t }]);
    putAll(l, 'reviews', [{ id: logId, cardId, deckId: card.deckId, rating, ts: t, ms: Math.min(ms, 120_000), prevState: card.srs.state }]);
  });
  const after = getLib();
  const goal = after.settings.dailyGoal;
  if (goal > 0 && reviewsBefore < goal && todayReviews(after, t) >= goal) {
    addXp(50, 'goal:' + dayKey(t), 'goal:' + dayKey(t));
    emit('toast', { kind: 'success', message: 'goal' });
  }
  const levelAfter = levelInfo(totalXp(getLib())).level;
  if (levelAfter > levelBefore) emit('levelUp', { level: levelAfter });
  checkBadges();
  return { before: card, logId };
}

export function undoRating(before: Card, logId: string) {
  useStore.getState().mutate((lib) => {
    putAll(lib, 'cards', [{ ...before, updatedAt: now() }]);
    removeAll(lib, 'reviews', [logId]);
  });
}

// ---------- xp, badges, settings ----------
export function addXp(amount: number, reason: string, id: string = uid()) {
  if (getLib().profile.xpEvents[id]) return;
  const levelBefore = levelInfo(totalXp(getLib())).level;
  useStore.getState().mutate((lib) => {
    lib.profile = { ...lib.profile, xpEvents: { ...lib.profile.xpEvents, [id]: { id, ts: now(), amount, reason } }, updatedAt: now() };
  });
  const levelAfter = levelInfo(totalXp(getLib())).level;
  if (levelAfter > levelBefore) emit('levelUp', { level: levelAfter });
  checkBadges();
}

export function checkBadges() {
  const earned = newlyEarned(getLib());
  if (!earned.length) return;
  useStore.getState().mutate((lib) => {
    const badges = { ...lib.profile.badges };
    for (const id of earned) badges[id] = now();
    lib.profile = { ...lib.profile, badges, updatedAt: now() };
  });
  for (const id of earned) emit('badge', { id });
}

export function updateProfile(patch: Partial<Library['profile']>) {
  useStore.getState().mutate((lib) => {
    lib.profile = { ...lib.profile, ...patch, updatedAt: now() };
  });
  checkBadges();
}

export function updateSettings(patch: Partial<Settings>) {
  useStore.getState().mutate((lib) => {
    lib.settings = { ...lib.settings, ...patch, updatedAt: now() };
  });
}

export function saveResume(patch: Partial<Library['resume']>) {
  useStore.getState().mutate(
    (lib) => {
      lib.resume = { ...lib.resume, ...patch, updatedAt: now() };
    },
    { dirty: true },
  );
}

export { putAll, removeAll };
