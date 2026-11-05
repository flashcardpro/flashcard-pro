import { create } from 'zustand';
import type { Note, NoteType } from './types';
import { addImageMedia, blankNote, ensureDefaultDeck, getLib } from './store';
import { primeMediaUrl } from './media';
import { navigate } from './router';
import { toast } from 'sonner';
import { tNow } from './i18n';

interface QueueState {
  drafts: Note[];
  index: number;
  adding: number;
  deckId: string | null;
  setDraft: (i: number, n: Note) => void;
  setIndex: (i: number) => void;
  remove: (i: number) => void;
  clear: () => void;
}

export const usePhotoQueue = create<QueueState>((set, get) => ({
  drafts: [],
  index: 0,
  adding: 0,
  deckId: null,
  setDraft(i, n) {
    const d = get().drafts.slice();
    d[i] = n;
    set({ drafts: d });
  },
  setIndex(i) {
    set({ index: Math.max(0, Math.min(get().drafts.length - 1, i)) });
  },
  remove(i) {
    const d = get().drafts.filter((_, k) => k !== i);
    set({ drafts: d, index: Math.max(0, Math.min(get().index, d.length - 1)) });
  },
  clear() {
    set({ drafts: [], index: 0 });
  },
}));

const TYPE_KEY = 'fcp-photo-type';

export function preferredPhotoType(): NoteType {
  const v = localStorage.getItem(TYPE_KEY);
  return v === 'basic' || v === 'reverse' ? v : 'occlusion';
}

export function setPreferredPhotoType(t: NoteType) {
  localStorage.setItem(TYPE_KEY, t);
}

export function currentDeckFromRoute(): string | null {
  const m = /^#\/deck\/([^/?]+)/.exec(window.location.hash);
  return m && getLib().decks[decodeURIComponent(m[1])] ? decodeURIComponent(m[1]) : null;
}

/** Turns picked, dropped or pasted photos into draft cards and opens the editor queue. */
export async function addPhotos(files: File[] | FileList, deckId?: string | null) {
  const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif|bmp)$/i.test(f.name));
  if (!list.length) {
    toast.error(tNow('Those files are not photos. Try JPG, PNG or WebP.'));
    return;
  }
  const q = usePhotoQueue.getState();
  const deck = deckId || q.deckId || currentDeckFromRoute() || ensureDefaultDeck().id;
  usePhotoQueue.setState({ adding: q.adding + list.length, deckId: deck });
  if (!window.location.hash.startsWith('#/add-photos')) navigate('/add-photos');
  const type = preferredPhotoType();
  let failed = 0;
  for (const f of list) {
    try {
      const meta = await addImageMedia(f, f.name);
      const note = blankNote(deck, type);
      note.image = { mediaId: meta.id, width: meta.width || 1, height: meta.height || 1, masks: [], annotations: [], side: 'front', occlusionMode: 'together' };
      const s = usePhotoQueue.getState();
      usePhotoQueue.setState({ drafts: [...s.drafts, note] });
      // warm the cache so thumbnails show instantly
      import('./db').then(({ getMediaBlob }) => getMediaBlob(meta.id).then((b) => b && primeMediaUrl(meta.id, b)));
    } catch {
      failed++;
    } finally {
      const s = usePhotoQueue.getState();
      usePhotoQueue.setState({ adding: Math.max(0, s.adding - 1) });
    }
  }
  if (failed) toast.error(tNow('{n} files could not be opened as photos.', { n: failed }));
}
