// A live shared deck is one JSON file in the owner's Google Drive. It holds the deck (and decks
// inside it), its notes and where its photos are. It never holds anyone's study progress: each
// person's cards and review history stay in their own library.
import type { Deck, Library, MediaMeta, Note, ShareMode } from './types';
import { deckDescendants } from './srs';

export const PACKAGE_KIND = 'flashcard-pro-shared-deck';
const KEEP_DELETED_MS = 90 * 86_400_000;

export interface SharedDeckInfo {
  id: string;
  name: string;
  parentId: string | null;
  color: Deck['color'];
  description: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface SharedMedia {
  driveId: string | null;
  mime: string;
  size: number;
  width?: number;
  height?: number;
}

export interface SharedPackage {
  kind: typeof PACKAGE_KIND;
  version: 1;
  rootId: string;
  mode: ShareMode;
  updatedAt: number;
  decks: SharedDeckInfo[];
  notes: Note[];
  /** Notes and decks removed from the shared deck, with when. */
  deleted: Record<string, number>;
  media: Record<string, SharedMedia>;
}

export function isSharedPackage(x: unknown): x is SharedPackage {
  const p = x as SharedPackage;
  return !!p && p.kind === PACKAGE_KIND && typeof p.rootId === 'string' && Array.isArray(p.notes) && Array.isArray(p.decks);
}

/** Media ids a note uses: its photo, its voice notes and pictures inside its text. */
export function mediaIdsOf(note: Note): string[] {
  const ids = new Set<string>();
  if (note.image?.mediaId) ids.add(note.image.mediaId);
  if (note.audioFront) ids.add(note.audioFront);
  if (note.audioBack) ids.add(note.audioBack);
  for (const html of [note.front, note.back, note.extra]) {
    for (const m of (html || '').matchAll(/fcp-media:([\w-]+)/g)) ids.add(m[1]);
  }
  return [...ids];
}

function deckInfo(d: Deck, rootId: string): SharedDeckInfo {
  return {
    id: d.id,
    name: d.name,
    parentId: d.id === rootId ? null : d.parentId,
    color: d.color,
    description: d.description,
    order: d.order,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export function buildPackage(lib: Library, rootId: string, mode: ShareMode, deleted: Record<string, number>, ts = Date.now()): SharedPackage {
  const deckIds = deckDescendants(lib, rootId);
  const inTree = new Set(deckIds);
  const decks = deckIds.map((id) => lib.decks[id]).filter(Boolean).map((d) => deckInfo(d, rootId));
  const notes = Object.values(lib.notes).filter((n) => inTree.has(n.deckId));
  const present = new Set([...notes.map((n) => n.id), ...deckIds]);
  const keep: Record<string, number> = {};
  for (const [id, at] of Object.entries(deleted)) if (!present.has(id) && ts - at < KEEP_DELETED_MS) keep[id] = at;
  const media: Record<string, SharedMedia> = {};
  for (const n of notes) {
    for (const id of mediaIdsOf(n)) {
      const m = lib.media[id];
      // A photo joins the shared file once it is in Drive (the next save puts it there).
      if (m?.driveId) media[id] = { driveId: m.driveId, mime: m.mime, size: m.size, width: m.width, height: m.height };
    }
  }
  const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : 1);
  return { kind: PACKAGE_KIND, version: 1, rootId, mode, updatedAt: ts, decks: decks.sort(byId), notes: notes.sort(byId), deleted: keep, media };
}

/** Compares what matters, so we only upload when something really changed. */
export function packageKey(p: SharedPackage): string {
  const sortObj = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  return JSON.stringify({ m: p.mode, d: p.decks, n: p.notes, x: sortObj(p.deleted), md: sortObj(p.media as Record<string, unknown>) });
}

export interface SharedChanges {
  decks: Deck[];
  notes: Note[];
  deleteNotes: string[];
  deleteDecks: string[];
  media: MediaMeta[];
}

export function hasChanges(c: SharedChanges): boolean {
  return !!(c.decks.length || c.notes.length || c.deleteNotes.length || c.deleteDecks.length || c.media.length);
}

/**
 * Brings the shared copy and this library together. The newest version of each note and deck
 * wins; a deletion wins over older edits. Returns what to change here and the deletions to keep.
 */
export function reconcile(lib: Library, rootId: string, remote: SharedPackage | null, ts = Date.now()): { changes: SharedChanges; deleted: Record<string, number> } {
  const changes: SharedChanges = { decks: [], notes: [], deleteNotes: [], deleteDecks: [], media: [] };
  const deleted: Record<string, number> = { ...(remote?.deleted || {}) };
  const mark = (id: string, at: number) => (deleted[id] = Math.max(deleted[id] || 0, at));
  if (!remote) return { changes, deleted };

  // Decks
  const localTree = new Set(deckDescendants(lib, rootId));
  const remoteDecks = new Map(remote.decks.map((d) => [d.id, d]));
  for (const r of remote.decks) {
    const l = lib.decks[r.id];
    if (!l) {
      if (r.id !== rootId && (lib.tombstones[r.id] || 0) >= r.updatedAt) {
        mark(r.id, lib.tombstones[r.id]);
        continue;
      }
      changes.decks.push({
        id: r.id,
        name: r.name,
        parentId: r.id === rootId ? null : r.parentId,
        color: r.color,
        description: r.description,
        examDate: null,
        newPerDay: 20,
        reviewsPerDay: 200,
        ttsLang: '',
        order: r.order,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      });
    } else if (r.updatedAt > l.updatedAt) {
      changes.decks.push({ ...l, name: r.name, color: r.color, description: r.description, order: r.order, parentId: r.id === rootId ? l.parentId : r.parentId, updatedAt: r.updatedAt });
    }
  }
  for (const id of localTree) {
    if (id === rootId || remoteDecks.has(id)) continue;
    const l = lib.decks[id];
    const del = remote.deleted[id];
    if (l && del && del >= l.updatedAt) changes.deleteDecks.push(id);
  }

  // Notes
  const remoteNotes = new Map(remote.notes.map((n) => [n.id, n]));
  const allTree = new Set([...localTree, ...remote.decks.map((d) => d.id)]);
  for (const r of remote.notes) {
    const l = lib.notes[r.id];
    if (l && allTree.has(l.deckId)) {
      if (r.updatedAt > l.updatedAt) changes.notes.push(r);
    } else if (l) {
      // Moved out of the shared deck here.
      if (l.updatedAt >= r.updatedAt) mark(r.id, l.updatedAt);
      else changes.notes.push(r);
    } else if ((lib.tombstones[r.id] || 0) >= r.updatedAt) {
      mark(r.id, lib.tombstones[r.id]);
    } else {
      changes.notes.push(r);
    }
  }
  for (const l of Object.values(lib.notes)) {
    if (!localTree.has(l.deckId) || remoteNotes.has(l.id)) continue;
    const del = remote.deleted[l.id];
    if (del && del >= l.updatedAt) changes.deleteNotes.push(l.id);
  }
  // A note edited after it was deleted somewhere else comes back.
  for (const l of Object.values(lib.notes)) if (localTree.has(l.deckId) && deleted[l.id] && l.updatedAt > deleted[l.id]) delete deleted[l.id];

  // Photos and voice notes the shared deck uses that this library does not know yet.
  for (const [id, m] of Object.entries(remote.media)) {
    const l = lib.media[id];
    if (!l) changes.media.push({ id, mime: m.mime, size: m.size, width: m.width, height: m.height, driveId: m.driveId, createdAt: ts, updatedAt: ts });
    else if (!l.driveId && m.driveId) changes.media.push({ ...l, driveId: m.driveId, updatedAt: ts });
  }
  return { changes, deleted };
}

/** A fresh, independent copy of a shared deck for "Add a copy" (new ids, so it never syncs). */
export function copyFromPackage(pkg: SharedPackage, newId: () => string): { decks: Deck[]; notes: Note[] } {
  const deckMap = new Map(pkg.decks.map((d) => [d.id, newId()]));
  const ts = Date.now();
  const decks: Deck[] = pkg.decks.map((d) => ({
    id: deckMap.get(d.id)!,
    name: d.name,
    parentId: d.id === pkg.rootId ? null : d.parentId ? deckMap.get(d.parentId) || null : null,
    color: d.color,
    description: d.description,
    examDate: null,
    newPerDay: 20,
    reviewsPerDay: 200,
    ttsLang: '',
    order: d.order,
    createdAt: ts,
    updatedAt: ts,
  }));
  const notes: Note[] = pkg.notes.map((n) => ({ ...n, id: newId(), deckId: deckMap.get(n.deckId) || deckMap.get(pkg.rootId)!, createdAt: ts, updatedAt: ts }));
  return { decks, notes };
}
