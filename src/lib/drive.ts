/* Google sign-in (Google Identity Services) and Google Drive storage, all in the browser. */
import type { GoogleUser } from './store';

declare global {
  interface Window {
    FCP_CONFIG?: { googleClientId?: string; googleApiKey?: string };
    google?: any;
  }
}

const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const ROOT_NAME = 'Flashcard Pro';

export class DriveAuthError extends Error {}

export function driveConfig() {
  return window.FCP_CONFIG || {};
}

export function isDriveConfigured(): boolean {
  return !!driveConfig().googleClientId;
}

export function isShareConfigured(): boolean {
  return !!driveConfig().googleApiKey;
}

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisPromise = null;
        reject(new Error('Google sign-in could not load. Check your internet connection.'));
      };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

let token: { value: string; expiresAt: number } | null = null;
let tokenClient: any = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

export function hasValidToken(): boolean {
  return !!token && token.expiresAt - 60_000 > Date.now();
}

export function tokenExpiresAt(): number {
  return token?.expiresAt ?? 0;
}

const TOKEN_KEY = 'fcp-drive-token';

/**
 * Google gives the browser a one-hour key for Drive. Keeping it in this browser (for that
 * account only) means a page reload does not ask you to reconnect while it is still valid.
 */
export function rememberToken(sub: string) {
  if (!token) return;
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ sub, value: token.value, expiresAt: token.expiresAt }));
  } catch {
    /* storage blocked: you reconnect after a reload, nothing else changes */
  }
}

/** Uses the saved key after a reload, if it belongs to this account and has not run out. */
export function restoreToken(sub: string): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (saved && saved.sub === sub && saved.value && saved.expiresAt - 60_000 > Date.now()) {
      token = { value: saved.value, expiresAt: saved.expiresAt };
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function clearToken() {
  token = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Loads Google's sign-in script early so a reconnect can open its window straight away. */
export function preloadGoogle() {
  if (isDriveConfigured()) void loadGis().catch(() => {});
}

async function requestToken(prompt: '' | 'consent' | 'select_account', hint?: string): Promise<string> {
  await loadGis();
  const clientId = driveConfig().googleClientId;
  if (!clientId) throw new Error('Google sign-in is not set up for this site yet.');
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (resp: any) => {
        const p = pending;
        pending = null;
        if (!p) return;
        if (resp.error) p.reject(new DriveAuthError(resp.error_description || resp.error));
        else {
          const granted = window.google.accounts.oauth2.hasGrantedAllScopes(resp, 'https://www.googleapis.com/auth/drive.file');
          if (!granted) {
            p.reject(new DriveAuthError('drive-permission'));
            return;
          }
          token = { value: resp.access_token, expiresAt: Date.now() + Number(resp.expires_in || 3600) * 1000 };
          p.resolve(token.value);
        }
      },
      error_callback: (err: any) => {
        const p = pending;
        pending = null;
        p?.reject(new DriveAuthError(err?.type === 'popup_closed' ? 'popup-closed' : err?.message || 'Sign-in was cancelled.'));
      },
    });
  }
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient.requestAccessToken({ prompt, login_hint: hint });
  });
}

export async function signIn(opts: { prompt?: '' | 'consent' | 'select_account'; hint?: string } = {}): Promise<GoogleUser> {
  const access = await requestToken(opts.prompt ?? 'select_account', opts.hint);
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + access } });
  if (!r.ok) throw new Error('Could not read your Google profile.');
  const u = await r.json();
  return { sub: u.sub, email: u.email || '', name: u.name || u.email || 'Google user', picture: u.picture || '' };
}

export function revokeAccess() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.value, () => {});
  token = null;
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  if (!hasValidToken()) throw new DriveAuthError('token-expired');
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + token!.value } });
  if (r.status === 401) {
    clearToken();
    throw new DriveAuthError('token-expired');
  }
  if (!r.ok) {
    let detail = '';
    try {
      const j = await r.json();
      detail = j?.error?.message || '';
    } catch {
      /* ignore */
    }
    throw new Error(`Google Drive error ${r.status}${detail ? ': ' + detail : ''}`);
  }
  return r;
}

interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  version?: string;
}

async function findOne(q: string): Promise<DriveFile | null> {
  const url = `${API}/files?q=${encodeURIComponent(q + ' and trashed = false')}&spaces=drive&fields=files(id,name,modifiedTime,version)&orderBy=modifiedTime desc&pageSize=5`;
  const r = await api(url);
  const j = await r.json();
  return j.files?.[0] || null;
}

async function createFolder(name: string, tag: string, parent?: string): Promise<string> {
  const r = await api(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: parent ? [parent] : undefined, appProperties: { fcp: tag } }),
  });
  return (await r.json()).id;
}

const folderCache = new Map<string, string>();
async function folder(tag: 'root' | 'media' | 'shared'): Promise<string> {
  const cached = folderCache.get(tag);
  if (cached) return cached;
  let id: string;
  if (tag === 'root') {
    const f = await findOne(`appProperties has { key='fcp' and value='root' } and mimeType = 'application/vnd.google-apps.folder'`);
    id = f?.id || (await createFolder(ROOT_NAME, 'root'));
  } else {
    const root = await folder('root');
    const f = await findOne(`appProperties has { key='fcp' and value='${tag}' } and '${root}' in parents`);
    id = f?.id || (await createFolder(tag === 'media' ? 'Photos and audio' : 'Shared decks', tag, root));
  }
  folderCache.set(tag, id);
  return id;
}

export function resetDriveCache() {
  folderCache.clear();
}

function multipart(meta: object, body: Blob | string, mime: string): { body: Blob; type: string } {
  const b = 'fcp' + Math.random().toString(36).slice(2);
  const blob = new Blob(
    [`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`, body, `\r\n--${b}--`],
  );
  return { body: blob, type: `multipart/related; boundary=${b}` };
}

export interface RemoteLibrary {
  id: string;
  version: string;
  modifiedTime: string;
}

export async function findLibraryFile(): Promise<RemoteLibrary | null> {
  const root = await folder('root');
  const f = await findOne(`appProperties has { key='fcp' and value='library' } and '${root}' in parents`);
  return f ? { id: f.id, version: f.version || '', modifiedTime: f.modifiedTime || '' } : null;
}

export async function downloadText(fileId: string): Promise<string> {
  const r = await api(`${API}/files/${fileId}?alt=media`);
  return r.text();
}

export async function uploadLibrary(existingId: string | null, json: string): Promise<RemoteLibrary> {
  const fields = 'id,version,modifiedTime';
  if (existingId) {
    const r = await api(`${UPLOAD}/files/${existingId}?uploadType=media&fields=${fields}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    });
    const j = await r.json();
    return { id: j.id, version: j.version, modifiedTime: j.modifiedTime };
  }
  const root = await folder('root');
  const mp = multipart({ name: 'Flashcard Pro library.json', parents: [root], mimeType: 'application/json', appProperties: { fcp: 'library' } }, json, 'application/json');
  const r = await api(`${UPLOAD}/files?uploadType=multipart&fields=${fields}`, { method: 'POST', headers: { 'Content-Type': mp.type }, body: mp.body });
  const j = await r.json();
  return { id: j.id, version: j.version, modifiedTime: j.modifiedTime };
}

export async function uploadMedia(blob: Blob, fileName: string, mediaId: string): Promise<string> {
  const parent = await folder('media');
  const mp = multipart({ name: fileName, parents: [parent], appProperties: { fcp: 'media', mediaId } }, blob, blob.type || 'application/octet-stream');
  const r = await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': mp.type }, body: mp.body });
  return (await r.json()).id;
}

export async function downloadBlob(fileId: string): Promise<Blob> {
  const r = await api(`${API}/files/${fileId}?alt=media`);
  return r.blob();
}

export async function uploadShare(blob: Blob, fileName: string, existingId?: string | null): Promise<string> {
  let id: string;
  if (existingId) {
    try {
      const r = await api(`${UPLOAD}/files/${existingId}?uploadType=media&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/zip' }, body: blob });
      id = (await r.json()).id;
    } catch {
      existingId = null;
    }
  }
  if (!existingId) {
    const parent = await folder('shared');
    const mp = multipart({ name: fileName, parents: [parent], appProperties: { fcp: 'share' } }, blob, 'application/zip');
    const r = await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': mp.type }, body: mp.body });
    id = (await r.json()).id;
  }
  await api(`${API}/files/${id!}/permissions?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  return id!;
}

// ---------- live shared decks ----------
const SHARED_MIME = 'application/json';

export function currentToken(): string | null {
  return hasValidToken() ? token!.value : null;
}

export function pickerAppId(): string {
  const c = driveConfig();
  return (c as { googleAppId?: string }).googleAppId || (c.googleClientId || '').split('-')[0];
}

/** Creates the shared deck file in the owner's "Shared decks" folder and opens it to anyone with the link. */
export async function createSharedDeckFile(json: string, name: string, role: 'reader' | 'writer'): Promise<string> {
  const parent = await folder('shared');
  const mp = multipart({ name, parents: [parent], mimeType: SHARED_MIME, appProperties: { fcp: 'sharedDeck' } }, new Blob([json], { type: SHARED_MIME }), SHARED_MIME);
  const r = await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': mp.type }, body: mp.body });
  const id = (await r.json()).id as string;
  await setLinkRole(id, role);
  return id;
}

export async function updateSharedDeckFile(fileId: string, json: string) {
  await api(`${UPLOAD}/files/${fileId}?uploadType=media&fields=id`, { method: 'PATCH', headers: { 'Content-Type': SHARED_MIME }, body: json });
}

/** Anyone with the link can view (reader) or edit (writer). */
export async function setLinkRole(fileId: string, role: 'reader' | 'writer') {
  try {
    await api(`${API}/files/${fileId}/permissions/anyoneWithLink?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
  } catch (e) {
    if (e instanceof DriveAuthError) throw e;
    await api(`${API}/files/${fileId}/permissions?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, type: 'anyone' }) });
  }
}

/** Makes one photo or voice note readable by anyone with its id, so people you share with can load it. */
export async function makeFilePublic(fileId: string): Promise<boolean> {
  try {
    await api(`${API}/files/${fileId}/permissions?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
    return true;
  } catch (e) {
    if (e instanceof DriveAuthError) throw e;
    return false;
  }
}

/** What this account's sign-in may do with the file through Flashcard Pro. */
export async function fileAccess(fileId: string): Promise<'none' | 'read' | 'edit'> {
  try {
    const r = await api(`${API}/files/${fileId}?fields=id,capabilities(canEdit)`);
    const j = await r.json();
    return j.capabilities?.canEdit ? 'edit' : 'read';
  } catch (e) {
    if (e instanceof DriveAuthError) throw e;
    return 'none';
  }
}

/** True when this account's sign-in can already read and write the file. */
export async function canEditFile(fileId: string): Promise<boolean> {
  return (await fileAccess(fileId)) === 'edit';
}

export async function stopSharing(fileId: string) {
  await api(`${API}/files/${fileId}/permissions/anyoneWithLink`, { method: 'DELETE' });
}

export const BLOCKED_MESSAGE =
  'Google is not letting this internet connection download shared files right now (it limits downloads without sign-in). Try again in a while, or on another network.';

/** Reads a file someone shared publicly. Uses the site's API key, no sign-in needed. */
export async function fetchPublicFile(fileId: string): Promise<Blob> {
  const key = driveConfig().googleApiKey;
  if (!/^[\w-]{10,}$/.test(fileId)) throw new Error('This share link is not valid.');
  if (key) {
    let r: Response | null = null;
    try {
      r = await fetch(`${API}/files/${fileId}?alt=media&key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    } catch {
      // Google answers "unusual traffic" without the headers browsers need, so it looks like a network error.
      r = null;
    }
    if (r?.ok) return r.blob();
    if (r && (r.status === 404 || r.status === 403) && !hasValidToken()) throw new Error('This deck is no longer shared, or the link is wrong.');
    if (hasValidToken()) {
      try {
        return await downloadBlob(fileId);
      } catch {
        /* not in this account's Drive */
      }
    }
    if (!r) throw new Error(BLOCKED_MESSAGE);
    throw new Error(r.status === 404 || r.status === 403 ? 'This deck is no longer shared, or the link is wrong.' : BLOCKED_MESSAGE);
  }
  if (hasValidToken()) return downloadBlob(fileId);
  throw new Error('Shared links need a Google API key on this site. Ask the owner to send the deck file instead.');
}

// ---------- reading shared things without signing in ----------
// Google limits plain downloads without sign-in, so shared decks avoid them: the deck lives in a
// Google Sheet (read through the Sheets service) and photos load through their thumbnail address.
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
export const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const CELL = 40_000; // a Sheets cell holds up to 50,000 characters

function keyParam(): string {
  const key = driveConfig().googleApiKey;
  if (!key) throw new Error('Shared links need a Google API key on this site.');
  return 'key=' + encodeURIComponent(key);
}

async function publicGet(url: string): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(url + (url.includes('?') ? '&' : '?') + keyParam(), { cache: 'no-store' });
  } catch {
    throw new Error(BLOCKED_MESSAGE);
  }
  if (r.status === 404 || r.status === 403) throw new Error('This deck is no longer shared, or the link is wrong.');
  if (!r.ok) throw new Error(`Google answered ${r.status}. Try again in a moment.`);
  return r;
}

export interface PublicFileInfo {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

/** Name, type and last change of a file shared by link. */
export async function publicFileInfo(fileId: string): Promise<PublicFileInfo> {
  if (!/^[\w-]{10,}$/.test(fileId)) throw new Error('This share link is not valid.');
  return (await publicGet(`${API}/files/${fileId}?fields=id,name,mimeType,modifiedTime`)).json();
}

/** A shared photo at full size, through Google's thumbnail address. */
export async function publicImage(fileId: string, size = 2400): Promise<Blob> {
  const j = await (await publicGet(`${API}/files/${fileId}?fields=thumbnailLink`)).json();
  if (!j.thumbnailLink) throw new Error('Photo not ready yet.');
  const url = String(j.thumbnailLink).replace(/=s\d+(-[\w-]+)?$/, '') + '=s' + Math.round(size);
  const r = await fetch(url);
  if (!r.ok) throw new Error('Photo could not load.');
  return r.blob();
}

/** Creates an empty Google Sheet for a shared deck and opens it to anyone with the link. */
export async function createSharedDeckSheet(name: string, role: 'reader' | 'writer'): Promise<string> {
  const parent = await folder('shared');
  const r = await api(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: SHEET_MIME, parents: [parent], appProperties: { fcp: 'sharedDeck' } }),
  });
  const id = (await r.json()).id as string;
  await setLinkRole(id, role);
  return id;
}

/** Splits text into cells without breaking a two-part character (like an emoji) in half. */
export function toCells(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + CELL);
    const c = text.charCodeAt(end - 1);
    if (end < text.length && c >= 0xd800 && c <= 0xdbff) end--;
    out.push(text.slice(i, end));
    i = end;
  }
  return out.length ? out : [''];
}

/** Saves text into column A of the deck's sheet (signed in, with edit access). */
export async function writeSheetText(sheetId: string, text: string) {
  const cells = toCells(text);
  const n = cells.length;
  await api(`${SHEETS}/${sheetId}/values/A1:A${n}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ range: `A1:A${n}`, majorDimension: 'ROWS', values: cells.map((c) => [c]) }),
  });
  if (n < 1000) await api(`${SHEETS}/${sheetId}/values/A${n + 1}:A:clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}

/** Reads the text back. Without sign-in it uses the site's key (the sheet must be shared by link). */
export async function readSheetText(sheetId: string, opts: { signedIn: boolean }): Promise<string> {
  const url = `${SHEETS}/${sheetId}/values/A:A?majorDimension=ROWS`;
  const r = opts.signedIn ? await api(url) : await publicGet(url);
  const j = await r.json();
  return ((j.values as string[][]) || []).map((row) => row[0] || '').join('');
}

/** Test hook: lets automated tests pretend a sign-in happened. */
export function __setTokenForTests(value: string | null) {
  token = value ? { value, expiresAt: Date.now() + 3600_000 } : null;
}
