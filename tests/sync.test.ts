import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, createDeck, blankNote, saveNote, addMediaBlob } from '../src/lib/store';
import { syncNow } from '../src/lib/sync';
import { __setTokenForTests, resetDriveCache } from '../src/lib/drive';
import { setMeta } from '../src/lib/db';
import { emptyLibrary } from '../src/lib/util';

/** A tiny in-memory Google Drive that understands the calls Flashcard Pro makes. */
interface F { id: string; name: string; parents: string[]; appProperties: Record<string, string>; mimeType: string; content: string; version: number }
const files = new Map<string, F>();
let nextId = 1;

function matches(f: F, q: string) {
  if (q.includes('trashed = false') === false) return false;
  const ap = /appProperties has \{ key='(\w+)' and value='([\w-]+)' \}/.exec(q);
  if (ap && f.appProperties[ap[1]] !== ap[2]) return false;
  const par = /'([\w-]+)' in parents/.exec(q);
  if (par && !f.parents.includes(par[1])) return false;
  if (q.includes("mimeType = 'application/vnd.google-apps.folder'") && f.mimeType !== 'application/vnd.google-apps.folder') return false;
  return true;
}

async function parseMultipart(body: Blob, type: string) {
  const boundary = /boundary=(\S+)/.exec(type)![1];
  const text = await body.text();
  const parts = text.split('--' + boundary).slice(1, -1);
  const meta = JSON.parse(parts[0].split('\r\n\r\n')[1].trim());
  const content = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
  return { meta, content };
}

globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const method = init.method || 'GET';
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname === '/drive/v3/files' && method === 'GET') {
    const q = url.searchParams.get('q') || '';
    return json({ files: [...files.values()].filter((f) => matches(f, q)).map((f) => ({ id: f.id, name: f.name, version: String(f.version), modifiedTime: '' })) });
  }
  if (url.pathname === '/drive/v3/files' && method === 'POST') {
    const meta = JSON.parse(String(init.body));
    const f: F = { id: 'f' + nextId++, name: meta.name, parents: meta.parents || [], appProperties: meta.appProperties || {}, mimeType: meta.mimeType, content: '', version: 1 };
    files.set(f.id, f);
    return json({ id: f.id });
  }
  if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
    const { meta, content } = await parseMultipart(init.body as Blob, (init.headers as Record<string, string>)['Content-Type']);
    const f: F = { id: 'f' + nextId++, name: meta.name, parents: meta.parents || [], appProperties: meta.appProperties || {}, mimeType: meta.mimeType || '', content, version: 1 };
    files.set(f.id, f);
    return json({ id: f.id, version: '1', modifiedTime: '' });
  }
  const up = /^\/upload\/drive\/v3\/files\/([\w-]+)$/.exec(url.pathname);
  if (up && method === 'PATCH') {
    const f = files.get(up[1])!;
    f.content = typeof init.body === 'string' ? init.body : await (init.body as Blob).text();
    f.version++;
    return json({ id: f.id, version: String(f.version), modifiedTime: '' });
  }
  const get = /^\/drive\/v3\/files\/([\w-]+)$/.exec(url.pathname);
  if (get && url.searchParams.get('alt') === 'media') return new Response(files.get(get[1])!.content, { status: 200 });
  return new Response('not handled ' + method + ' ' + url.pathname, { status: 500 });
}) as typeof fetch;

const user = { sub: 'u1', email: 'n@example.com', name: 'N', picture: '' };
const libFile = () => [...files.values()].find((f) => f.appProperties.fcp === 'library')!;

describe('Google Drive sync', () => {
  beforeEach(async () => {
    files.clear();
    resetDriveCache();
    __setTokenForTests('test-token');
    await useStore.getState().init('g:u1');
    useStore.getState().replaceLibrary(emptyLibrary(), { dirty: false });
    useStore.getState().setUser(user);
    await setMeta('remote:g:u1', null);
  });

  it('first sync creates the folder, uploads photos and the library', async () => {
    const d = createDeck('Biology', 'green');
    const meta = await addMediaBlob(new Blob(['fake-image'], { type: 'image/png' }), { width: 10, height: 10 });
    saveNote({ ...blankNote(d.id), front: 'Cell', back: 'Unit of life' });
    expect(await syncNow()).toBe(true);
    const root = [...files.values()].find((f) => f.appProperties.fcp === 'root')!;
    expect(root.name).toBe('Flashcard Pro');
    expect(libFile().parents).toEqual([root.id]);
    const remote = JSON.parse(libFile().content);
    expect(Object.values(remote.decks).map((x: any) => x.name)).toEqual(['Biology']);
    expect(useStore.getState().lib.media[meta.id].driveId).toBeTruthy();
    expect(useStore.getState().syncStatus).toBe('synced');
    expect(useStore.getState().dirty).toBe(false);
  });

  it('a new device signing in pulls everything, and edits from two devices merge', async () => {
    createDeck('Physics', 'blue');
    await syncNow();
    // New device: empty local copy, no remembered Drive version.
    useStore.getState().replaceLibrary(emptyLibrary(), { dirty: false });
    await setMeta('remote:g:u1', null);
    await syncNow();
    expect(Object.values(useStore.getState().lib.decks).map((d) => d.name)).toEqual(['Physics']);

    // Another device adds a deck in Drive while this one adds a different deck.
    const remote = JSON.parse(libFile().content);
    remote.decks.other = { ...Object.values(remote.decks)[0] as object, id: 'other', name: 'Chemistry', updatedAt: Date.now() };
    libFile().content = JSON.stringify(remote);
    libFile().version++;
    createDeck('Maths', 'red');
    await syncNow();
    const names = Object.values(useStore.getState().lib.decks).map((d) => d.name).sort();
    expect(names).toEqual(['Chemistry', 'Maths', 'Physics']);
    const stored = Object.values(JSON.parse(libFile().content).decks).map((d: any) => d.name).sort();
    expect(stored).toEqual(['Chemistry', 'Maths', 'Physics']);
  });

  it('pauses instead of failing when the Google sign-in has expired', async () => {
    __setTokenForTests(null);
    createDeck('History');
    expect(await syncNow()).toBe(false);
    expect(useStore.getState().syncStatus).toBe('paused');
    expect(useStore.getState().dirty).toBe(true);
  });
});
