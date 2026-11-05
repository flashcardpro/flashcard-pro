import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { buildPackage, copyFromPackage, hasChanges, packageKey, reconcile, type SharedChanges, type SharedPackage } from '../src/lib/sharedDeck';
import { emptyLibrary, newDeck } from '../src/lib/util';
import { applySharedChanges, useStore } from '../src/lib/store';
import type { Library, Note } from '../src/lib/types';

function note(id: string, deckId: string, front: string, updatedAt: number, mediaId?: string): Note {
  return {
    id,
    deckId,
    type: 'basic',
    front,
    back: 'back of ' + front,
    extra: '',
    tags: [],
    flag: null,
    audioFront: null,
    audioBack: null,
    image: mediaId ? { mediaId, width: 10, height: 10, side: 'front', occlusionMode: 'together', annotations: [], masks: [] } : null,
    createdAt: 1,
    updatedAt,
  } as Note;
}

/** Applies changes the way the store does, minus cards, so both sides can be plain objects. */
function apply(lib: Library, c: SharedChanges, ts: number): Library {
  const out: Library = { ...lib, decks: { ...lib.decks }, notes: { ...lib.notes }, media: { ...lib.media }, tombstones: { ...lib.tombstones } };
  for (const m of c.media) if (!out.media[m.id]) out.media[m.id] = m;
  for (const d of c.decks) out.decks[d.id] = d;
  for (const n of c.notes) out.notes[n.id] = n;
  for (const id of c.deleteNotes) {
    delete out.notes[id];
    out.tombstones[id] = ts;
  }
  for (const id of c.deleteDecks) {
    delete out.decks[id];
    out.tombstones[id] = ts;
  }
  return out;
}

/** One person syncing: read the shared file, merge, write it back. */
function syncOnce(lib: Library, rootId: string, remote: SharedPackage | null, ts: number): { lib: Library; pkg: SharedPackage } {
  const { changes, deleted } = reconcile(lib, rootId, remote, ts);
  const next = hasChanges(changes) ? apply(lib, changes, ts) : lib;
  const pkg = JSON.parse(JSON.stringify(buildPackage(next, rootId, remote?.mode || 'edit', deleted, ts))) as SharedPackage;
  return { lib: next, pkg };
}

function ownerLibrary() {
  const lib = emptyLibrary();
  const root = { ...newDeck('Biology', 'green'), id: 'root', updatedAt: 10 };
  const inner = { ...newDeck('Cells', 'blue', 'root'), id: 'inner', updatedAt: 10 };
  const other = { ...newDeck('Private', 'red'), id: 'other', updatedAt: 10 };
  lib.decks = { root, inner, other };
  lib.notes = {
    n1: note('n1', 'root', 'What is DNA?', 10),
    n2: note('n2', 'inner', 'Cell wall', 10, 'img1'),
    secret: note('secret', 'other', 'Not shared', 10),
  };
  lib.media = { img1: { id: 'img1', mime: 'image/jpeg', size: 100, width: 10, height: 10, driveId: 'drive-img1', createdAt: 1, updatedAt: 1 } };
  return lib;
}

describe('live shared decks', () => {
  it('packs the deck, the decks inside it and their photos, nothing else', () => {
    const pkg = buildPackage(ownerLibrary(), 'root', 'view', {}, 100);
    expect(pkg.decks.map((d) => d.id).sort()).toEqual(['inner', 'root']);
    expect(pkg.decks.find((d) => d.id === 'root')!.parentId).toBeNull();
    expect(pkg.notes.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
    expect(pkg.media.img1.driveId).toBe('drive-img1');
    expect(JSON.stringify(pkg)).not.toContain('secret');
    // No study progress or reviews in the shared file.
    expect(Object.keys(pkg)).not.toContain('cards');
    expect(Object.keys(pkg)).not.toContain('reviews');
  });

  it('sends edits both ways and keeps the newest', () => {
    let owner = ownerLibrary();
    let file = buildPackage(owner, 'root', 'edit', {}, 100);
    // Someone joins with an empty library.
    let editor = syncOnce(emptyLibrary(), 'root', file, 110);
    expect(Object.keys(editor.lib.notes).sort()).toEqual(['n1', 'n2']);
    expect(editor.lib.media.img1.driveId).toBe('drive-img1');
    file = editor.pkg;

    // The editor fixes a card and adds one.
    editor.lib = { ...editor.lib, notes: { ...editor.lib.notes, n1: { ...editor.lib.notes.n1, back: 'Genetic code', updatedAt: 200 }, n3: note('n3', 'inner', 'Nucleus', 200) } };
    editor = syncOnce(editor.lib, 'root', file, 210);
    file = editor.pkg;

    // The owner picks both up; their private deck is untouched.
    const o = syncOnce(owner, 'root', file, 220);
    owner = o.lib;
    expect(owner.notes.n1.back).toBe('Genetic code');
    expect(owner.notes.n3.front).toBe('Nucleus');
    expect(owner.notes.secret).toBeTruthy();
    expect(packageKey(o.pkg)).toBe(packageKey(file)); // nothing new to upload
  });

  it('a deletion reaches everyone, unless the card was edited after it', () => {
    const owner0 = ownerLibrary();
    let file = buildPackage(owner0, 'root', 'edit', {}, 100);
    let editor = syncOnce(emptyLibrary(), 'root', file, 110).lib;

    // Owner deletes n1 at 300.
    const owner1 = { ...owner0, notes: { ...owner0.notes }, tombstones: { n1: 300 } };
    delete owner1.notes.n1;
    const o = syncOnce(owner1, 'root', file, 310);
    file = o.pkg;
    expect(file.notes.find((n) => n.id === 'n1')).toBeUndefined();
    expect(file.deleted.n1).toBe(300);

    // Editor syncs and loses n1 too.
    const e = syncOnce(editor, 'root', file, 320);
    editor = e.lib;
    expect(editor.notes.n1).toBeUndefined();

    // A card edited after someone else deleted it comes back.
    const owner2 = { ...owner0, notes: { ...owner0.notes }, tombstones: { n2: 400 } };
    delete owner2.notes.n2;
    file = syncOnce(owner2, 'root', file, 410).pkg;
    const editor2 = { ...editor, notes: { ...editor.notes, n2: { ...editor.notes.n2, front: 'Cell wall (plants)', updatedAt: 500 } } };
    file = syncOnce(editor2, 'root', file, 510).pkg;
    expect(file.notes.find((n) => n.id === 'n2')?.front).toBe('Cell wall (plants)');
    expect(file.deleted.n2).toBeUndefined();
  });

  it('a separate copy gets new ids so it never syncs', () => {
    const pkg = buildPackage(ownerLibrary(), 'root', 'view', {}, 100);
    let i = 0;
    const { decks, notes } = copyFromPackage(pkg, () => 'new' + ++i);
    expect(decks.every((d) => d.id.startsWith('new'))).toBe(true);
    expect(notes.every((n) => n.id.startsWith('new'))).toBe(true);
    const root = decks.find((d) => d.parentId === null)!;
    const inner = decks.find((d) => d.parentId === root.id)!;
    expect(notes.find((n) => n.front === 'Cell wall')!.deckId).toBe(inner.id);
    expect(decks.some((d) => d.share)).toBe(false);
  });

  it('joining creates your own study cards for the shared notes', async () => {
    await useStore.getState().init('test-shared');
    useStore.getState().replaceLibrary(emptyLibrary(), { dirty: false });
    const pkg = buildPackage(ownerLibrary(), 'root', 'edit', {}, 100);
    const { changes } = reconcile(useStore.getState().lib, 'root', pkg, 120);
    applySharedChanges(changes);
    const lib = useStore.getState().lib;
    expect(Object.keys(lib.decks).sort()).toEqual(['inner', 'root']);
    expect(Object.values(lib.cards).map((c) => c.noteId).sort()).toEqual(['n1', 'n2']);
    expect(lib.media.img1.driveId).toBe('drive-img1');
  });
});
