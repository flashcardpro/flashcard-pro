import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { useStore, migratePhotosToOneCard, saveNote, createDeck } from '../src/lib/store';
import { emptyLibrary } from '../src/lib/util';
import type { Note } from '../src/lib/types';

describe('one card per photo', () => {
  it('switches older photos to one card once, keeping the settings timestamp', async () => {
    await useStore.getState().init('test-photos');
    const lib = emptyLibrary();
    lib.settings = { ...lib.settings, photosOneCard: false, updatedAt: 1234 };
    useStore.getState().replaceLibrary(lib, { dirty: false });
    const d = createDeck('Space', 'blue');
    const n: Note = {
      id: 'p1',
      deckId: d.id,
      type: 'occlusion',
      front: '',
      back: '',
      extra: '',
      tags: [],
      flag: null,
      audioFront: null,
      audioBack: null,
      image: {
        mediaId: 'm',
        width: 10,
        height: 10,
        side: 'front',
        occlusionMode: 'hideAll',
        annotations: [],
        masks: [
          { id: 'a', kind: 'rect', x: 0, y: 0, w: 1, h: 1, label: 'Mercury', group: 1 },
          { id: 'b', kind: 'rect', x: 2, y: 0, w: 1, h: 1, label: 'Venus', group: 2 },
        ],
      },
      createdAt: 1,
      updatedAt: 1,
    } as Note;
    saveNote(n);
    useStore.getState().mutate((l) => {
      l.settings = { ...l.settings, photosOneCard: false, updatedAt: 1234 };
    });
    expect(Object.values(useStore.getState().lib.cards).filter((c) => c.noteId === 'p1')).toHaveLength(2);
    expect(migratePhotosToOneCard()).toBe(1);
    const after = useStore.getState().lib;
    expect(Object.values(after.cards).filter((c) => c.noteId === 'p1').map((c) => c.ord)).toEqual(['all']);
    expect(after.notes.p1.image!.occlusionMode).toBe('together');
    expect(after.settings.photosOneCard).toBe(true);
    expect(after.settings.updatedAt).toBe(1234);
    expect(migratePhotosToOneCard()).toBe(0);
  });
});
