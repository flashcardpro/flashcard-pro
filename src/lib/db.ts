import { createStore, del, get, set } from 'idb-keyval';
import type { Library } from './types';

const libStore = createStore('flashcard-pro', 'library');
const mediaStore = createStore('flashcard-pro-media', 'blobs');

export const GUEST_KEY = 'guest';

export async function loadLibrary(userKey: string): Promise<Library | undefined> {
  try {
    return await get<Library>('lib:' + userKey, libStore);
  } catch {
    return undefined;
  }
}

export async function saveLibrary(userKey: string, lib: Library): Promise<void> {
  await set('lib:' + userKey, lib, libStore);
}

export async function deleteLibrary(userKey: string): Promise<void> {
  await del('lib:' + userKey, libStore);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>('meta:' + key, libStore);
  } catch {
    return undefined;
  }
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await set('meta:' + key, value, libStore);
}

export async function putMediaBlob(id: string, blob: Blob): Promise<void> {
  await set(id, blob, mediaStore);
}

export async function getMediaBlob(id: string): Promise<Blob | undefined> {
  try {
    return await get<Blob>(id, mediaStore);
  } catch {
    return undefined;
  }
}

export async function deleteMediaBlob(id: string): Promise<void> {
  await del(id, mediaStore);
}
