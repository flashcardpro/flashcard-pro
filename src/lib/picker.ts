// Google's file picker. With the narrow "only files this app uses" Drive permission, someone you
// share an editable deck with must select that file once, so Google lets Flashcard Pro edit it.
//
// The picker normally shows inside the page, but many browsers block Google's sign-in inside
// embedded frames (it then asks to sign in and fails with "The API developer key is invalid").
// So we open it as its own small window, for the right Google account, and wait until Google
// gives this app access to the file.
import { currentToken, driveConfig, fileAccess, pickerAppId } from './drive';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi?: any;
  }
}

let loading: Promise<void> | null = null;

/** Loads Google's picker code. Safe to call early so it is ready when someone clicks. */
export function loadPicker(): Promise<void> {
  if ((window as any).google?.picker) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const done = () => window.gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('Google file picker could not load.')) });
      if (window.gapi?.load) return done();
      const s = document.createElement('script');
      s.src = 'https://apis.google.com/js/api.js';
      s.async = true;
      s.onload = done;
      s.onerror = () => {
        loading = null;
        reject(new Error('Google file picker could not load. Check your internet connection.'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Works out the address of Google's picker showing just this file, for the signed-in account.
 * The picker builds its address when shown, so we show it hidden for a moment and read it.
 */
export async function pickerUrl(fileId: string, title: string, email: string, lang: string): Promise<string> {
  const token = currentToken();
  const key = driveConfig().googleApiKey;
  if (!token || !key) throw new Error('Sign in with Google first.');
  await loadPicker();
  const gp = (window as any).google.picker;
  const style = document.createElement('style');
  style.textContent = '.picker-dialog,.picker-dialog-bg{visibility:hidden!important;pointer-events:none!important}';
  document.head.appendChild(style);
  const before = new Set([...document.querySelectorAll('iframe')]);
  const picker = new gp.PickerBuilder()
    .setAppId(pickerAppId())
    .setOAuthToken(token)
    .setDeveloperKey(key)
    .setOrigin(window.location.protocol + '//' + window.location.host)
    .setLocale(lang === 'hi' ? 'hi' : 'en')
    .addView(new gp.DocsView(gp.ViewId.DOCS).setFileIds(fileId).setMode(gp.DocsViewMode.LIST))
    .setTitle(title)
    .setCallback(() => {})
    .build();
  try {
    picker.setVisible(true);
    let frame: HTMLIFrameElement | undefined;
    for (let i = 0; i < 40 && !frame; i++) {
      frame = [...document.querySelectorAll('iframe')].find((f) => !before.has(f) && /\/picker\b/.test(f.src));
      if (!frame) await sleep(75);
    }
    if (!frame) throw new Error('Google file picker could not open.');
    const url = new URL(frame.src);
    // Use the same Google account the person signed in to Flashcard Pro with.
    if (email) url.searchParams.set('authuser', email);
    return url.toString();
  } finally {
    try {
      picker.setVisible(false);
      picker.dispose?.();
    } catch {
      /* already gone */
    }
    style.remove();
  }
}

/** Opens the picker as its own window. Must run straight from a click. Returns null if blocked. */
export function openPickerWindow(url: string): Window | null {
  const w = Math.min(820, window.screen.availWidth - 40);
  const h = Math.min(620, window.screen.availHeight - 60);
  const left = Math.max(0, (window.screen.availWidth - w) / 2);
  const top = Math.max(0, (window.screen.availHeight - h) / 2);
  return window.open(url, 'fcp-google-picker', `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
}

/**
 * Checks every second and a half until Google gives this app access to the file (that happens
 * the moment the person clicks Select in the picker). Resolves 'none' if cancelled or after 10 minutes.
 */
export async function waitForAccess(fileId: string, opts: { signal?: AbortSignal; popup?: Window | null } = {}): Promise<'none' | 'read' | 'edit'> {
  const until = Date.now() + 10 * 60_000;
  while (Date.now() < until && !opts.signal?.aborted) {
    const a = await fileAccess(fileId).catch(() => 'none' as const);
    if (a !== 'none') {
      try {
        opts.popup?.close();
      } catch {
        /* Google may not let us close it; the person can */
      }
      return a;
    }
    await sleep(1500);
  }
  return 'none';
}
