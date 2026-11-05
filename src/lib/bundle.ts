import JSZip from 'jszip';
import type { Deck, Library, MediaMeta, Note } from './types';
import { deckDescendants } from './srs';
import { getMediaBlobAny } from './media';
import { extForMime } from './image';
import { getLib, putAll, useStore, checkBadges, addXp } from './store';
import { putMediaBlob } from './db';
import { syncCardsForNote } from './cards';
import { now, uid } from './util';
import { sanitize } from './render';

export interface DeckBundle {
  format: 'flashcard-pro-deck';
  version: 1;
  exportedAt: number;
  rootIds: string[];
  decks: Deck[];
  notes: Note[];
  media: MediaMeta[];
}

const MEDIA_SRC = /fcp-media:([\w-]+)/g;

function mediaRefs(note: Note): string[] {
  const ids = new Set<string>();
  if (note.image) ids.add(note.image.mediaId);
  if (note.audioFront) ids.add(note.audioFront);
  if (note.audioBack) ids.add(note.audioBack);
  for (const f of [note.front, note.back, note.extra]) for (const m of f.matchAll(MEDIA_SRC)) ids.add(m[1]);
  return [...ids];
}

/** Packs decks (with sub-decks), notes and their photos/audio into one .fcpro zip. Study progress is left out. */
export async function buildBundle(lib: Library, rootIds: string[]): Promise<Blob> {
  const deckIds = new Set<string>();
  for (const r of rootIds) for (const id of deckDescendants(lib, r)) deckIds.add(id);
  const decks = [...deckIds].map((id) => lib.decks[id]).filter(Boolean).map((d) => ({ ...d, shareId: null }));
  const notes = Object.values(lib.notes).filter((n) => deckIds.has(n.deckId));
  const mediaIds = new Set<string>();
  for (const n of notes) for (const id of mediaRefs(n)) mediaIds.add(id);
  const zip = new JSZip();
  const media: MediaMeta[] = [];
  for (const id of mediaIds) {
    const meta = lib.media[id];
    const blob = await getMediaBlobAny(id);
    if (!meta || !blob) continue;
    const name = `${id}.${extForMime(meta.mime)}`;
    zip.file('media/' + name, blob);
    media.push({ ...meta, driveId: null, name });
  }
  const bundle: DeckBundle = {
    format: 'flashcard-pro-deck',
    version: 1,
    exportedAt: now(),
    rootIds: rootIds.filter((r) => deckIds.has(r)),
    decks,
    notes,
    media,
  };
  zip.file('deck.json', JSON.stringify(bundle));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export interface ParsedBundle {
  bundle: DeckBundle;
  files: Map<string, Blob>;
}

export async function readBundle(data: Blob | ArrayBuffer): Promise<ParsedBundle> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error('This is not a Flashcard Pro deck file.');
  }
  const json = zip.file('deck.json');
  if (!json) throw new Error('This is not a Flashcard Pro deck file.');
  const bundle = JSON.parse(await json.async('string')) as DeckBundle;
  if (bundle.format !== 'flashcard-pro-deck') throw new Error('This is not a Flashcard Pro deck file.');
  const files = new Map<string, Blob>();
  for (const m of bundle.media || []) {
    const f = zip.file('media/' + m.name);
    if (f) files.set(m.id, new Blob([await f.async('arraybuffer')], { type: m.mime }));
  }
  return { bundle, files };
}

/** Adds a parsed bundle to the library with fresh ids, so importing twice never overwrites anything. */
export async function importBundle(parsed: ParsedBundle, parentId: string | null = null): Promise<string[]> {
  const { bundle, files } = parsed;
  const t = now();
  const deckMap = new Map<string, string>();
  const mediaMap = new Map<string, string>();
  for (const d of bundle.decks) deckMap.set(d.id, uid());
  const newMedia: MediaMeta[] = [];
  for (const m of bundle.media) {
    const blob = files.get(m.id);
    if (!blob) continue;
    const id = uid();
    await putMediaBlob(id, blob);
    mediaMap.set(m.id, id);
    newMedia.push({ ...m, id, driveId: null, createdAt: t, updatedAt: t });
  }
  const order = Object.keys(getLib().decks).length;
  const decks: Deck[] = bundle.decks.map((d, i) => ({
    ...d,
    id: deckMap.get(d.id)!,
    parentId: d.parentId && deckMap.has(d.parentId) ? deckMap.get(d.parentId)! : parentId,
    shareId: null,
    order: order + i,
    createdAt: t,
    updatedAt: t,
  }));
  const remapHtml = (html: string) => sanitize(html.replace(MEDIA_SRC, (_m, id) => 'fcp-media:' + (mediaMap.get(id) || id)));
  const notes: Note[] = bundle.notes
    .filter((n) => deckMap.has(n.deckId))
    .map((n) => ({
      ...n,
      id: uid(),
      deckId: deckMap.get(n.deckId)!,
      front: remapHtml(n.front),
      back: remapHtml(n.back),
      extra: remapHtml(n.extra || ''),
      image: n.image && mediaMap.has(n.image.mediaId) ? { ...n.image, mediaId: mediaMap.get(n.image.mediaId)! } : null,
      audioFront: n.audioFront ? mediaMap.get(n.audioFront) || null : null,
      audioBack: n.audioBack ? mediaMap.get(n.audioBack) || null : null,
      tags: n.tags || [],
      createdAt: t,
      updatedAt: t,
    }));
  useStore.getState().mutate((lib) => {
    putAll(lib, 'media', newMedia);
    putAll(lib, 'decks', decks);
    putAll(lib, 'notes', notes);
    for (const n of notes) putAll(lib, 'cards', syncCardsForNote(lib, n, t).upserts);
  });
  addXp(10, 'import');
  checkBadges();
  return bundle.rootIds.map((r) => deckMap.get(r)!).filter(Boolean);
}
