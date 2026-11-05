// Google's file picker. With the narrow "only files this app uses" Drive permission, someone you
// share an editable deck with must pick that file once, so Google lets Flashcard Pro edit it for them.
import { currentToken, driveConfig, pickerAppId } from './drive';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi?: any;
  }
}

let loading: Promise<void> | null = null;

function loadPicker(): Promise<void> {
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

/** Opens Google's picker on one file. Resolves true when the person picks it. */
export async function pickSharedFile(fileId: string, title: string): Promise<boolean> {
  const token = currentToken();
  const key = driveConfig().googleApiKey;
  if (!token || !key) throw new Error('Sign in with Google first.');
  await loadPicker();
  const gp = (window as any).google.picker;
  return new Promise<boolean>((resolve) => {
    const view = new gp.DocsView(gp.ViewId.DOCS).setFileIds(fileId).setMode(gp.DocsViewMode.LIST);
    const picker = new gp.PickerBuilder()
      .setAppId(pickerAppId())
      .setOAuthToken(token)
      .setDeveloperKey(key)
      .addView(view)
      .setTitle(title)
      .setCallback((data: any) => {
        const action = data?.[gp.Response?.ACTION || 'action'] ?? data?.action;
        if (action === gp.Action.PICKED) resolve(true);
        else if (action === gp.Action.CANCEL) resolve(false);
      })
      .build();
    picker.setVisible(true);
  });
}
