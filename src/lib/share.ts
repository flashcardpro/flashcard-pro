import { create } from 'zustand';
import { buildBundle, readBundle, type ParsedBundle } from './bundle';
import {
  DriveAuthError,
  canEditFile,
  createSharedDeckFile,
  downloadText,
  fetchPublicFile,
  hasValidToken,
  makeFilePublic,
  setLinkRole,
  stopSharing,
  updateSharedDeckFile,
  uploadShare,
} from './drive';
import { addXp, applySharedChanges, getLib, updateDeck } from './store';
import { getMeta, putMediaBlob, setMeta } from './db';
import { siteUrl } from './router';
import { safeFileName, uid } from './util';
import { tNow } from './i18n';
import { buildPackage, copyFromPackage, hasChanges, isSharedPackage, packageKey, reconcile, type SharedPackage } from './sharedDeck';
import type { MediaMeta, ShareMode } from './types';

export function shareLink(fileId: string) {
  return siteUrl('/shared/' + fileId);
}

const linkRole = (mode: ShareMode) => (mode === 'edit' ? 'writer' : 'reader');

// ---------- how each shared deck is doing, for the Share window ----------
export type ShareState = 'syncing' | 'synced' | 'no-access' | 'view-only' | 'error';
export const useShareStatus = create<Record<string, { state: ShareState; at: number }>>(() => ({}));
const setStatus = (deckId: string, state: ShareState) => useShareStatus.setState({ [deckId]: { state, at: Date.now() } });

// ---------- reading a link ----------
export type SharedLink = { kind: 'live'; pkg: SharedPackage } | { kind: 'copy'; parsed: ParsedBundle };

/** Opens a share link: a live shared deck, or an older one-time copy. No sign-in needed. */
export async function readSharedLink(fileId: string): Promise<SharedLink> {
  const blob = await fetchPublicFile(fileId);
  const head = await blob.slice(0, 2).text();
  if (head === 'PK') return { kind: 'copy', parsed: await readBundle(blob) };
  let data: unknown = null;
  try {
    data = JSON.parse(await blob.text());
  } catch {
    /* not ours */
  }
  if (!isSharedPackage(data)) throw new Error(tNow('This link is not a Flashcard Pro deck.'));
  return { kind: 'live', pkg: data };
}

// ---------- photos ----------
/** Lets people with the link load the deck's photos and voice notes (only files this account made). */
async function publishMedia(pkg: SharedPackage) {
  const done = ((await getMeta('public-media')) as Record<string, number> | null) || {};
  let changed = false;
  for (const m of Object.values(pkg.media)) {
    if (!m.driveId || done[m.driveId]) continue;
    await makeFilePublic(m.driveId);
    done[m.driveId] = Date.now();
    changed = true;
  }
  if (changed) await setMeta('public-media', done);
}

// ---------- owner ----------
/** Creates a live link for a deck: anyone with it can view, or also edit. */
export async function startLiveShare(deckId: string, mode: ShareMode): Promise<string> {
  if (!hasValidToken()) throw new Error(tNow('Sign in with Google to share by link.'));
  const { syncNow } = await import('./sync');
  await syncNow(); // puts any new photos in Drive first
  const lib = getLib();
  const deck = lib.decks[deckId];
  if (!deck) throw new Error(tNow('Deck not found.'));
  const pkg = buildPackage(lib, deckId, mode, {});
  await publishMedia(pkg);
  const id = await createSharedDeckFile(JSON.stringify(pkg), `${safeFileName(deck.name)} - Flashcard Pro shared deck.json`, linkRole(mode));
  if (deck.shareId) {
    try {
      await stopSharing(deck.shareId);
    } catch {
      /* the old copy link may already be gone */
    }
  }
  updateDeck(deckId, { share: { fileId: id, mode, role: 'owner' }, shareId: null });
  setStatus(deckId, 'synced');
  addXp(20, 'share:' + deckId, 'share:' + deckId);
  return shareLink(id);
}

export async function changeShareMode(deckId: string, mode: ShareMode) {
  const d = getLib().decks[deckId];
  if (!d?.share || d.share.role !== 'owner') return;
  await setLinkRole(d.share.fileId, linkRole(mode));
  updateDeck(deckId, { share: { ...d.share, mode } });
  await syncSharedDeck(deckId);
}

/** Turns the link off. Your deck stays; people who joined keep their own copy but stop getting changes. */
export async function stopLiveShare(deckId: string) {
  const d = getLib().decks[deckId];
  if (!d?.share) return;
  if (d.share.role === 'owner') await stopSharing(d.share.fileId);
  updateDeck(deckId, { share: null });
}

/** For someone who joined: stop syncing, keep the cards as your own. */
export function leaveSharedDeck(deckId: string) {
  updateDeck(deckId, { share: null });
}

// ---------- everyone who edits or follows ----------
let running = false;
let lastRun = 0;
let lastLib: unknown = null;

/**
 * Brings in other people's changes and sends yours. Runs after each Drive save, when you come
 * back to the tab and every minute. Skips the trip when nothing changed here and it just ran.
 */
export async function syncSharedDecks(opts: { force?: boolean } = {}) {
  const lib = getLib();
  const roots = Object.values(lib.decks).filter((d) => d.share && !(d.parentId && lib.decks[d.parentId]?.share));
  if (running || !roots.length || !navigator.onLine) return;
  if (!opts.force && lib === lastLib && Date.now() - lastRun < 45_000) return;
  running = true;
  lastRun = Date.now();
  try {
    for (const d of roots) {
      try {
        await syncSharedDeck(d.id);
      } catch (e) {
        if (e instanceof DriveAuthError) break; // sign-in ran out; the next save tries again
        console.warn('Shared deck sync failed', e);
        setStatus(d.id, 'error');
      }
    }
  } finally {
    lastLib = getLib();
    running = false;
  }
}

async function readRemote(fileId: string, role: 'owner' | 'editor' | 'viewer'): Promise<SharedPackage | null> {
  const text = role === 'viewer' ? await (await fetchPublicFile(fileId)).text() : await downloadText(fileId);
  const parsed = JSON.parse(text);
  return isSharedPackage(parsed) ? parsed : null;
}

export async function syncSharedDeck(deckId: string) {
  const deck = getLib().decks[deckId];
  if (!deck?.share) return;
  const { fileId, role } = deck.share;
  // Following a view-only link works without signing in; editing needs Google.
  if (role !== 'viewer' && !hasValidToken()) return;
  setStatus(deckId, 'syncing');
  let remote: SharedPackage | null = null;
  try {
    remote = await readRemote(fileId, role);
  } catch (e) {
    if (e instanceof DriveAuthError) throw e;
    setStatus(deckId, 'no-access');
    return;
  }
  if (!remote && role !== 'owner') {
    setStatus(deckId, 'no-access');
    return;
  }
  const { changes, deleted } = reconcile(getLib(), deckId, remote);
  if (hasChanges(changes)) applySharedChanges(changes);
  const mode: ShareMode = role === 'owner' ? deck.share.mode : remote?.mode || deck.share.mode;
  if (role !== 'owner' && mode !== deck.share.mode) updateDeck(deckId, { share: { ...deck.share, mode } });
  if (role === 'viewer') {
    setStatus(deckId, 'synced');
    return;
  }
  if (role === 'editor' && mode !== 'edit') {
    setStatus(deckId, 'view-only');
    return;
  }
  const pkg = buildPackage(getLib(), deckId, mode, deleted);
  if (!remote || packageKey(pkg) !== packageKey(remote)) {
    await publishMedia(pkg);
    await updateSharedDeckFile(fileId, JSON.stringify(pkg));
  }
  setStatus(deckId, 'synced');
}

// ---------- someone opening the link ----------
/** Edit together: Google may ask you to pick the deck file once so Flashcard Pro can save to it. */
export async function joinSharedDeck(fileId: string, pkg: SharedPackage): Promise<string> {
  if (!(await canEditFile(fileId))) {
    const { pickSharedFile } = await import('./picker');
    const picked = await pickSharedFile(fileId, tNow('Select this deck so Flashcard Pro can save your edits'));
    if (!picked) throw new Error(tNow('To edit together, select the deck in the Google window.'));
    if (!(await canEditFile(fileId))) throw new Error(tNow('Google did not allow editing. Ask the owner to set the link to "Can edit".'));
  }
  return joinAs(fileId, pkg, 'editor');
}

/** Add a view-only deck that keeps getting the owner's changes. Works without signing in. */
export function followSharedDeck(fileId: string, pkg: SharedPackage): string {
  return joinAs(fileId, pkg, 'viewer');
}

function joinAs(fileId: string, pkg: SharedPackage, role: 'editor' | 'viewer'): string {
  const { changes } = reconcile(getLib(), pkg.rootId, pkg);
  applySharedChanges(changes);
  updateDeck(pkg.rootId, { share: { fileId, mode: pkg.mode, role } });
  setStatus(pkg.rootId, 'synced');
  lastLib = getLib();
  lastRun = Date.now();
  if (role === 'editor') void import('./sync').then((m) => m.syncNow());
  return pkg.rootId;
}

/** The deck in this library that is joined to a share link, if any. */
export function joinedDeckFor(fileId: string): string | null {
  const d = Object.values(getLib().decks).find((x) => x.share?.fileId === fileId);
  return d?.id || null;
}

/** Add a copy: your own deck, with its photos saved here, that never changes with the original. */
export async function addSharedCopy(pkg: SharedPackage): Promise<string> {
  const { decks, notes } = copyFromPackage(pkg, uid);
  const media: MediaMeta[] = [];
  const ts = Date.now();
  for (const [id, m] of Object.entries(pkg.media)) {
    if (getLib().media[id]) continue;
    let blob: Blob | null = null;
    try {
      if (m.driveId) blob = await fetchPublicFile(m.driveId);
    } catch {
      /* photo no longer shared */
    }
    if (blob) await putMediaBlob(id, blob.type ? blob : new Blob([blob], { type: m.mime }));
    media.push({ id, mime: m.mime, size: m.size, width: m.width, height: m.height, driveId: blob ? null : m.driveId, createdAt: ts, updatedAt: ts });
  }
  applySharedChanges({ decks, notes, deleteNotes: [], deleteDecks: [], media });
  return decks.find((d) => d.parentId === null)?.id || decks[0].id;
}

// ---------- older one-time copy links ----------
/** Uploads a copy of the deck to the owner's Drive and makes it readable by anyone with the link. */
export async function shareDeck(deckId: string): Promise<string> {
  if (!hasValidToken()) throw new Error('Sign in with Google to share by link.');
  const lib = getLib();
  const deck = lib.decks[deckId];
  if (!deck) throw new Error('Deck not found.');
  const blob = await buildBundle(lib, [deckId]);
  const id = await uploadShare(blob, `${safeFileName(deck.name)}.fcpro`, deck.shareId);
  updateDeck(deckId, { shareId: id });
  return shareLink(id);
}

export async function unshareDeck(deckId: string) {
  const deck = getLib().decks[deckId];
  if (!deck?.shareId) return;
  try {
    await stopSharing(deck.shareId);
  } finally {
    updateDeck(deckId, { shareId: null });
  }
}
