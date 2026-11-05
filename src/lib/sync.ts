import { useStore, getLib, setMediaDriveId, type GoogleUser } from './store';
import { GUEST_KEY, getMediaBlob, getMeta, loadLibrary, setMeta, deleteLibrary } from './db';
import {
  DriveAuthError,
  clearToken,
  downloadText,
  findLibraryFile,
  hasValidToken,
  isDriveConfigured,
  preloadGoogle,
  rememberToken,
  resetDriveCache,
  restoreToken,
  signIn,
  tokenExpiresAt,
  uploadLibrary,
  uploadMedia,
} from './drive';
import { isLibraryEmpty, mergeLibraries, normalizeLibrary } from './merge';
import { extForMime } from './image';
import type { Library } from './types';

const LAST_USER = 'fcp-last-user';

export function rememberedUser(): GoogleUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER);
    return raw ? (JSON.parse(raw) as GoogleUser) : null;
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;

export function scheduleSync(delay = 3000) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delay);
}

interface RemoteState {
  fileId: string;
  version: string;
}

export async function syncNow(): Promise<boolean> {
  const st = useStore.getState();
  if (!st.user) return false;
  if (!navigator.onLine) {
    st.setSync({ syncStatus: 'offline' });
    return false;
  }
  if (!hasValidToken()) {
    st.setSync({ syncStatus: 'paused' });
    armAutoReconnect();
    return false;
  }
  if (running) {
    again = true;
    return false;
  }
  running = true;
  st.setSync({ syncStatus: 'syncing', syncError: '' });
  const userKey = st.userKey;
  try {
    // 1. Upload photos and audio that are not in Drive yet.
    const pendingMedia = Object.values(getLib().media).filter((m) => !m.driveId);
    for (const m of pendingMedia) {
      const blob = await getMediaBlob(m.id);
      if (!blob) continue;
      const driveId = await uploadMedia(blob, `${m.id}.${extForMime(m.mime)}`, m.id);
      if (useStore.getState().userKey !== userKey) return false;
      setMediaDriveId(m.id, driveId);
    }

    // 2. Pull the Drive copy if it changed, merge, push the result.
    const startLib = getLib();
    const startDirty = useStore.getState().dirty;
    const known = await getMeta<RemoteState>('remote:' + userKey);
    const remote = await findLibraryFile();
    let merged: Library = startLib;
    let remoteText = '';
    if (remote && (!known || known.version !== remote.version || known.fileId !== remote.id)) {
      remoteText = await downloadText(remote.id);
      let parsed: Library | undefined;
      try {
        parsed = normalizeLibrary(JSON.parse(remoteText));
      } catch {
        throw new Error('The library file in your Drive is damaged. Your local copy was kept.');
      }
      merged = mergeLibraries(startLib, parsed);
    }
    const mergedText = JSON.stringify(merged);
    let newRemote: RemoteState | null = known || null;
    if (!remote || startDirty || (remoteText && mergedText !== remoteText)) {
      const up = await uploadLibrary(remote?.id ?? null, mergedText);
      newRemote = { fileId: up.id, version: up.version };
    } else if (remote) {
      newRemote = { fileId: remote.id, version: remote.version };
    }
    if (useStore.getState().userKey !== userKey) return false;
    if (newRemote) await setMeta('remote:' + userKey, newRemote);

    const nowLib = getLib();
    if (nowLib === startLib) {
      if (merged !== startLib) useStore.getState().replaceLibrary(merged, { dirty: false });
      else useStore.getState().setSync({ dirty: false });
    } else {
      // The user changed something while we were syncing; keep both and go again.
      useStore.getState().replaceLibrary(mergeLibraries(nowLib, merged), { dirty: true });
      again = true;
    }
    useStore.getState().setSync({ syncStatus: 'synced', lastSyncedAt: Date.now() });
    return true;
  } catch (e) {
    if (e instanceof DriveAuthError) {
      useStore.getState().setSync({ syncStatus: 'paused' });
      armAutoReconnect();
    } else {
      console.error(e);
      useStore.getState().setSync({ syncStatus: 'error', syncError: (e as Error).message });
    }
    return false;
  } finally {
    running = false;
    if (again) {
      again = false;
      scheduleSync(1500);
    }
  }
}

let started = false;
export function startSyncLoop() {
  if (started) return;
  started = true;
  useStore.subscribe((s, prev) => {
    if (s.user && s.dirty && (s.lib !== prev.lib || !prev.dirty)) scheduleSync(3500);
  });
  window.addEventListener('focus', () => useStore.getState().user && scheduleSync(400));
  window.addEventListener('online', () => useStore.getState().user && scheduleSync(400));
  // Everything is already saved in this browser; this just tries one last upload.
  window.addEventListener('pagehide', () => {
    const s = useStore.getState();
    if (s.user && s.dirty && hasValidToken()) void syncNow();
  });
  setInterval(() => {
    const s = useStore.getState();
    if (s.user && hasValidToken()) void syncNow();
    // Renew the key on your next click a few minutes before it runs out, so saving never pauses.
    if (s.user && tokenExpiresAt() - Date.now() < 6 * 60_000) armAutoReconnect();
  }, 60_000);
}

/**
 * Google only lets a site open its sign-in window right after you click or press a key.
 * So when the Drive key is missing or about to run out, the next click anywhere quietly
 * renews it (the Google window opens and closes by itself for an account that already agreed).
 */
let armed = false;
function armAutoReconnect() {
  if (armed || !isDriveConfigured() || !useStore.getState().user) return;
  armed = true;
  const go = (e: Event) => {
    const target = e.target as HTMLElement | null;
    // The Drive chip and Sign out handle this themselves.
    if (target?.closest?.('.sync-chip, [data-no-auto-reconnect]')) return;
    disarm();
    const s = useStore.getState();
    if (!s.user || (hasValidToken() && tokenExpiresAt() - Date.now() > 6 * 60_000)) return;
    void reconnect().catch(() => {
      /* closed or blocked: the Reconnect Drive button stays visible */
    });
  };
  const disarm = () => {
    armed = false;
    window.removeEventListener('pointerdown', go, true);
    window.removeEventListener('keydown', go, true);
  };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
}

export type SignInResult = { user: GoogleUser; guestHasData: boolean; resumeRoute: string };

/** Signs in, switches to that user's library, pulls Drive, and reports where to resume. */
export async function signInAndLoad(prompt: '' | 'consent' | 'select_account' = 'select_account'): Promise<SignInResult> {
  if (!isDriveConfigured()) throw new Error('not-configured');
  const remembered = rememberedUser();
  const user = await signIn({ prompt, hint: remembered?.email });
  localStorage.setItem(LAST_USER, JSON.stringify(user));
  rememberToken(user.sub);
  const st = useStore.getState();
  const key = 'g:' + user.sub;
  if (st.userKey !== key) {
    resetDriveCache();
    await st.init(key);
  }
  useStore.getState().setUser(user);
  await syncNow();
  const guest = normalizeLibrary(await loadLibrary(GUEST_KEY));
  return { user, guestHasData: !isLibraryEmpty(guest), resumeRoute: getLib().resume.route || '/' };
}

/** Reconnects the current account after the one-hour Google token runs out. */
let reconnecting: Promise<void> | null = null;
export function reconnect(): Promise<void> {
  if (reconnecting) return reconnecting;
  reconnecting = (async () => {
    const u = useStore.getState().user || rememberedUser();
    const fresh = await signIn({ prompt: '', hint: u?.email });
    rememberToken(fresh.sub);
    useStore.getState().setSync({ syncStatus: 'idle' });
    await syncNow();
  })().finally(() => {
    reconnecting = null;
  });
  return reconnecting;
}

export async function mergeGuestIntoAccount(): Promise<void> {
  const guest = normalizeLibrary(await loadLibrary(GUEST_KEY));
  const merged = mergeLibraries(getLib(), guest);
  // Media copied from the guest library still needs uploading.
  useStore.getState().replaceLibrary(merged, { dirty: true });
  await deleteLibrary(GUEST_KEY);
  scheduleSync(500);
}

export async function signOut(): Promise<void> {
  const st = useStore.getState();
  if (st.dirty && hasValidToken()) await syncNow();
  clearToken();
  resetDriveCache();
  localStorage.removeItem(LAST_USER);
  st.setUser(null);
  st.setSync({ syncStatus: 'local', dirty: false });
  await st.init(GUEST_KEY);
}

/** On page load: show the remembered account's cached library right away. */
export async function bootstrap(): Promise<void> {
  const remembered = isDriveConfigured() ? rememberedUser() : null;
  const st = useStore.getState();
  if (remembered) {
    await st.init('g:' + remembered.sub);
    st.setUser(remembered);
    preloadGoogle();
    if (restoreToken(remembered.sub)) {
      // Still signed in from before the reload: carry on saving without asking.
      st.setSync({ syncStatus: 'idle' });
      startSyncLoop();
      void syncNow();
      return;
    }
    st.setSync({ syncStatus: 'paused' });
    armAutoReconnect();
  } else {
    await st.init(GUEST_KEY);
  }
  startSyncLoop();
}
