import { useEffect, useState } from 'react';
import { getMediaBlob, putMediaBlob } from './db';
import { downloadBlob as driveDownload, hasValidToken, isShareConfigured } from './drive';
import { getLib } from './store';

const urls = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

export async function getMediaBlobAny(id: string): Promise<Blob | null> {
  const local = await getMediaBlob(id);
  if (local) return local;
  const meta = getLib().media[id];
  if (!meta?.driveId) return null;
  const keep = async (blob: Blob) => {
    const typed = blob.type ? blob : new Blob([blob], { type: meta.mime });
    await putMediaBlob(id, typed);
    return typed;
  };
  if (hasValidToken()) {
    try {
      return await keep(await driveDownload(meta.driveId));
    } catch {
      /* not in this account's Drive: it may be a photo from a deck someone shared */
    }
  }
  if (isShareConfigured()) {
    try {
      const { publicMedia } = await import('./share');
      return await keep(await publicMedia(meta.driveId, meta));
    } catch (e) {
      console.warn('Media download failed', e);
    }
  }
  return null;
}

export function getMediaUrl(id: string): Promise<string | null> {
  const hit = urls.get(id);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(id);
  if (running) return running;
  const p = getMediaBlobAny(id).then((blob) => {
    inflight.delete(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  });
  inflight.set(id, p);
  return p;
}

export function peekMediaUrl(id: string | null | undefined): string | null {
  return id ? urls.get(id) || null : null;
}

/** Registers a blob we already have in memory (fresh upload) so it shows instantly. */
export function primeMediaUrl(id: string, blob: Blob) {
  if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob));
}

export function useMediaUrl(id: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => peekMediaUrl(id));
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    const hit = peekMediaUrl(id);
    if (hit) {
      setUrl(hit);
      return;
    }
    setUrl(null);
    getMediaUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

/** Media id referenced by an object URL, for turning editor HTML back into stored HTML. */
export function mediaIdForUrl(url: string): string | null {
  for (const [id, u] of urls) if (u === url) return id;
  return null;
}
