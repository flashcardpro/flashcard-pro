import JSZip from 'jszip';
import { decompress } from 'fzstd';
import type { Deck, Mask, MediaMeta, Note, NoteType } from './types';
import { newDeck, now, uid } from './util';
import { mimeForName } from './image';
import { sanitize } from './render';

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const isZstd = (b: Uint8Array) => ZSTD_MAGIC.every((v, i) => b[i] === v);

export interface AnkiImport {
  decks: Deck[];
  notes: Note[];
  media: { meta: MediaMeta; blob: Blob }[];
  skipped: number;
}

/** Tiny protobuf reader for Anki's newer media index (field 1 = repeated entry, entry field 1 = file name). */
function readMediaProto(buf: Uint8Array): string[] {
  const names: string[] = [];
  let i = 0;
  const varint = (): number => {
    let shift = 0;
    let result = 0;
    while (i < buf.length) {
      const b = buf[i++];
      result += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    return result;
  };
  const dec = new TextDecoder();
  while (i < buf.length) {
    const key = varint();
    const field = key >> 3;
    const wire = key & 7;
    if (wire === 2) {
      const len = varint();
      const sub = buf.subarray(i, i + len);
      i += len;
      if (field === 1) {
        // parse entry
        let j = 0;
        let name = '';
        const v2 = () => {
          let shift = 0;
          let r = 0;
          while (j < sub.length) {
            const b = sub[j++];
            r += (b & 0x7f) * 2 ** shift;
            if (!(b & 0x80)) break;
            shift += 7;
          }
          return r;
        };
        while (j < sub.length) {
          const k = v2();
          const f = k >> 3;
          const w = k & 7;
          if (w === 2) {
            const l = v2();
            if (f === 1) name = dec.decode(sub.subarray(j, j + l));
            j += l;
          } else if (w === 0) v2();
          else if (w === 1) j += 8;
          else if (w === 5) j += 4;
          else break;
        }
        names.push(name);
      }
    } else if (wire === 0) varint();
    else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else break;
  }
  return names;
}

type SqlDb = { exec: (sql: string) => { columns: string[]; values: any[][] }[]; close: () => void };

async function openSqlite(bytes: Uint8Array): Promise<SqlDb> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  return new SQL.Database(bytes) as unknown as SqlDb;
}

function rows(db: SqlDb, sql: string): Record<string, any>[] {
  try {
    const res = db.exec(sql);
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
  } catch {
    return [];
  }
}

interface ModelInfo {
  name: string;
  fields: string[];
  cloze: boolean;
}

function parseIoField(text: string, w: number, h: number): { masks: Mask[]; hideAll: boolean } {
  const masks: Mask[] = [];
  let hideAll = true;
  const re = /\{\{c(\d+)::image-occlusion:(rect|ellipse|polygon)((?::[^:}]+=[^:}]*)*)\}\}/g;
  for (const m of text.matchAll(re)) {
    const group = Number(m[1]);
    const kind = m[2] as Mask['kind'];
    const props: Record<string, string> = {};
    for (const part of m[3].split(':').filter(Boolean)) {
      const [k, ...rest] = part.split('=');
      props[k] = rest.join('=');
    }
    if (props.oi === '0') hideAll = false;
    const num = (k: string) => parseFloat(props[k] || '0');
    const normalized = ['left', 'top', 'width', 'height'].every((k) => num(k) <= 1.0001);
    const sx = normalized ? w : 1;
    const sy = normalized ? h : 1;
    const label = props.text || '';
    if (kind === 'polygon' && props.points) {
      const pts = props.points
        .trim()
        .split(/\s+/)
        .flatMap((p) => p.split(',').map(Number));
      const scaled = pts.map((v, i) => (pts.every((x) => x <= 1.0001) ? v * (i % 2 ? h : w) : v));
      const xs = scaled.filter((_, i) => i % 2 === 0);
      const ys = scaled.filter((_, i) => i % 2 === 1);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      masks.push({ id: uid(), kind: 'polygon', x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, points: scaled, label, group });
    } else {
      masks.push({ id: uid(), kind: kind === 'ellipse' ? 'ellipse' : 'rect', x: num('left') * sx, y: num('top') * sy, w: num('width') * sx, h: num('height') * sy, label, group });
    }
  }
  return { masks, hideAll };
}

function imageSize(blob: Blob): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });
}

/** Reads an Anki .apkg or .colpkg file (old and new formats) into Flashcard Pro decks and notes. */
export async function parseApkg(file: Blob, onProgress?: (msg: string) => void): Promise<AnkiImport> {
  onProgress?.('Opening file');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This is not an Anki deck file (.apkg).');
  }
  const colFile = zip.file('collection.anki21b') || zip.file('collection.anki21') || zip.file('collection.anki2');
  if (!colFile) throw new Error('No Anki collection was found inside this file.');
  let colBytes: Uint8Array = new Uint8Array(await colFile.async('uint8array'));
  if (isZstd(colBytes)) colBytes = decompress(colBytes);

  // Media index: JSON in old files, zstd-compressed protobuf in new ones.
  const mediaNames = new Map<string, string>(); // zip entry -> original name
  const mediaFile = zip.file('media');
  if (mediaFile) {
    let raw: Uint8Array = new Uint8Array(await mediaFile.async('uint8array'));
    if (isZstd(raw)) raw = decompress(raw);
    const text = new TextDecoder().decode(raw);
    try {
      const j = JSON.parse(text);
      for (const [k, v] of Object.entries(j)) mediaNames.set(k, String(v));
    } catch {
      readMediaProto(raw).forEach((name, idx) => mediaNames.set(String(idx), name));
    }
  }

  onProgress?.('Reading cards');
  const db = await openSqlite(colBytes);
  try {
    const models = new Map<string, ModelInfo>();
    const deckNames = new Map<string, string>();
    const col = rows(db, 'select models, decks from col')[0];
    if (col?.models && col.models.length > 2) {
      const ms = JSON.parse(col.models);
      for (const [id, m] of Object.entries<any>(ms)) {
        models.set(String(id), { name: m.name || '', fields: (m.flds || []).map((f: any) => f.name), cloze: m.type === 1 });
      }
    }
    if (col?.decks && col.decks.length > 2) {
      const ds = JSON.parse(col.decks);
      for (const [id, d] of Object.entries<any>(ds)) deckNames.set(String(id), String(d.name));
    }
    if (!models.size) {
      for (const nt of rows(db, 'select id, name from notetypes')) {
        const fields = rows(db, `select name from fields where ntid = ${Number(nt.id)} order by ord`).map((f) => String(f.name));
        models.set(String(nt.id), { name: String(nt.name), fields, cloze: /cloze/i.test(String(nt.name)) });
      }
    }
    if (!deckNames.size) for (const d of rows(db, 'select id, name from decks')) deckNames.set(String(d.id), String(d.name).replace(/\x1f/g, '::'));

    const noteDeck = new Map<string, string>();
    for (const c of rows(db, 'select nid, did from cards order by ord')) if (!noteDeck.has(String(c.nid))) noteDeck.set(String(c.nid), String(c.did));
    const ankiNotes = rows(db, 'select id, mid, flds, tags from notes');

    // Media blobs, keyed by original file name.
    onProgress?.('Copying photos and audio');
    const t = now();
    const mediaByName = new Map<string, { meta: MediaMeta; blob: Blob }>();
    for (const [entry, name] of mediaNames) {
      const f = zip.file(entry);
      if (!f) continue;
      let bytes: Uint8Array = new Uint8Array(await f.async('uint8array'));
      if (isZstd(bytes)) bytes = decompress(bytes);
      const mime = mimeForName(name);
      if (!mime.startsWith('image/') && !mime.startsWith('audio/')) continue;
      const blob = new Blob([bytes as BlobPart], { type: mime });
      const meta: MediaMeta = { id: uid(), mime, size: blob.size, name, driveId: null, createdAt: t, updatedAt: t };
      if (mime.startsWith('image/')) {
        const s = await imageSize(blob);
        meta.width = s.w;
        meta.height = s.h;
      }
      mediaByName.set(name, { meta, blob });
    }
    const used = new Set<string>();

    // Decks from names like "Biology::Cells".
    const deckByPath = new Map<string, Deck>();
    const colors = ['blue', 'green', 'orange', 'purple', 'teal', 'pink', 'red', 'indigo', 'yellow'] as const;
    const ensureDeck = (path: string): Deck => {
      const parts = path.split('::').filter(Boolean);
      let parent: Deck | null = null;
      let acc = '';
      for (const p of parts) {
        acc = acc ? acc + '::' + p : p;
        let d = deckByPath.get(acc);
        if (!d) {
          d = newDeck(p, colors[deckByPath.size % colors.length], parent?.id ?? null, deckByPath.size);
          deckByPath.set(acc, d);
        }
        parent = d;
      }
      return parent ?? ensureDeck('Imported');
    };

    const fixHtml = (html: string): { html: string; sounds: string[] } => {
      const sounds: string[] = [];
      let out = html.replace(/\[sound:([^\]]+)\]/g, (_m, name) => {
        sounds.push(name);
        return '';
      });
      out = out.replace(/<img([^>]*?)src=["']?([^"'>\s]+)["']?([^>]*)>/gi, (m, a, src, b) => {
        let name = src;
        try {
          name = decodeURIComponent(src);
        } catch {
          /* keep */
        }
        const media = mediaByName.get(name) || mediaByName.get(src);
        if (!media) return m;
        used.add(media.meta.id);
        return `<img${a}src="fcp-media:${media.meta.id}"${b}>`;
      });
      return { html: sanitize(out), sounds };
    };
    const soundId = (names: string[]) => {
      for (const n of names) {
        const m = mediaByName.get(n);
        if (m) {
          used.add(m.meta.id);
          return m.meta.id;
        }
      }
      return null;
    };

    const notes: Note[] = [];
    let skipped = 0;
    for (const an of ankiNotes) {
      const model = models.get(String(an.mid)) || { name: '', fields: [], cloze: false };
      const flds = String(an.flds).split('\x1f');
      const byName = (n: string) => {
        const i = model.fields.findIndex((f) => f.toLowerCase() === n.toLowerCase());
        return i >= 0 ? flds[i] || '' : '';
      };
      const deckPath = deckNames.get(noteDeck.get(String(an.id)) || '') || 'Imported';
      const deck = ensureDeck(deckPath === 'Default' ? 'Imported' : deckPath);
      const tags = String(an.tags || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const base: Note = {
        id: uid(),
        deckId: deck.id,
        type: 'basic',
        front: '',
        back: '',
        extra: '',
        image: null,
        audioFront: null,
        audioBack: null,
        tags,
        flag: null,
        createdAt: t + notes.length,
        updatedAt: t,
      };
      const ioField = flds.find((f) => f.includes('image-occlusion:'));
      if (ioField) {
        const imgField = byName('Image') || flds.find((f) => /<img/i.test(f)) || '';
        const src = /src=["']?([^"'>\s]+)/i.exec(imgField)?.[1] || '';
        const media = mediaByName.get(decodeURIComponent(src)) || mediaByName.get(src);
        if (!media || !media.meta.width) {
          skipped++;
          continue;
        }
        used.add(media.meta.id);
        const { masks, hideAll } = parseIoField(ioField, media.meta.width, media.meta.height || 0);
        const header = fixHtml(byName('Header'));
        const backExtra = fixHtml(byName('Back Extra') || byName('Comments'));
        notes.push({
          ...base,
          type: 'occlusion',
          front: header.html,
          back: backExtra.html,
          image: { mediaId: media.meta.id, width: media.meta.width, height: media.meta.height || 0, masks, annotations: [], side: 'front', occlusionMode: hideAll ? 'hideAll' : 'hideOne' },
        });
        continue;
      }
      const isCloze = model.cloze || flds.some((f) => /\{\{c\d+::/.test(f));
      if (isCloze) {
        const text = fixHtml(flds[0] || '');
        const extra = fixHtml(flds.slice(1).filter((f) => f.trim()).join('<br>'));
        notes.push({ ...base, type: 'cloze', front: text.html, extra: extra.html, audioFront: soundId([...text.sounds, ...extra.sounds]) });
        continue;
      }
      const front = fixHtml(flds[0] || '');
      const back = fixHtml(flds.slice(1).filter((f) => f.trim()).join('<br>'));
      if (!front.html.trim() && !back.html.trim() && !front.sounds.length) {
        skipped++;
        continue;
      }
      const type: NoteType = /revers/i.test(model.name) ? 'reverse' : 'basic';
      notes.push({ ...base, type, front: front.html, back: back.html, audioFront: soundId(front.sounds), audioBack: soundId(back.sounds) });
    }
    const media = [...mediaByName.values()].filter((m) => used.has(m.meta.id));
    const decks = [...deckByPath.values()].filter((d) => notes.some((n) => n.deckId === d.id) || [...deckByPath.values()].some((c) => c.parentId === d.id));
    return { decks, notes, media, skipped };
  } finally {
    db.close();
  }
}
