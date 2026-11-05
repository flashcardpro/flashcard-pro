import type { Annotation, Mask } from './types';

export const MAX_EDGE = 2048;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This file could not be read as an image.'));
    img.src = src;
  });
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall back below (HEIC on some browsers, odd formats) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), type, quality));
}

function pickType(original: string): string {
  return original === 'image/png' || original === 'image/gif' ? 'image/png' : 'image/jpeg';
}

/** Resizes large photos to keep Drive storage small while staying sharp. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const d = await decode(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(d.width, d.height));
  const w = Math.round(d.width * scale);
  const h = Math.round(d.height * scale);
  const keepOriginal = scale === 1 && file.size < 1_500_000 && /image\/(jpeg|png|webp)/.test(file.type);
  if (keepOriginal) {
    d.close?.();
    return { blob: file, width: w, height: h };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(d.source, 0, 0, w, h);
  d.close?.();
  const type = pickType(file.type);
  const blob = await canvasToBlob(canvas, type, 0.86);
  return { blob, width: w, height: h };
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rotates by quarter turns then crops (crop box is in rotated-image pixels). */
export async function rotateAndCrop(src: Blob, quarterTurns: number, crop: CropBox | null): Promise<PreparedImage> {
  const d = await decode(src);
  const q = ((quarterTurns % 4) + 4) % 4;
  const rw = q % 2 ? d.height : d.width;
  const rh = q % 2 ? d.width : d.height;
  const rot = document.createElement('canvas');
  rot.width = rw;
  rot.height = rh;
  const rctx = rot.getContext('2d')!;
  rctx.translate(rw / 2, rh / 2);
  rctx.rotate((q * Math.PI) / 2);
  rctx.drawImage(d.source, -d.width / 2, -d.height / 2);
  d.close?.();
  const c = crop ? clampCrop(crop, rw, rh) : { x: 0, y: 0, width: rw, height: rh };
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(c.width));
  out.height = Math.max(1, Math.round(c.height));
  out.getContext('2d')!.drawImage(rot, c.x, c.y, c.width, c.height, 0, 0, out.width, out.height);
  const blob = await canvasToBlob(out, pickType(src.type), 0.9);
  return { blob, width: out.width, height: out.height };
}

function clampCrop(c: CropBox, w: number, h: number): CropBox {
  const x = Math.max(0, Math.min(w - 1, c.x));
  const y = Math.max(0, Math.min(h - 1, c.y));
  return { x, y, width: Math.max(1, Math.min(w - x, c.width)), height: Math.max(1, Math.min(h - y, c.height)) };
}

type Pt = [number, number];

function rotPt([x, y]: Pt, q: number, w: number, h: number): Pt {
  switch (q) {
    case 1:
      return [h - y, x];
    case 2:
      return [w - x, h - y];
    case 3:
      return [y, w - x];
    default:
      return [x, y];
  }
}

function rotRect(x: number, y: number, rw: number, rh: number, q: number, w: number, h: number) {
  const a = rotPt([x, y], q, w, h);
  const b = rotPt([x + rw, y + rh], q, w, h);
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

function mapPoints(points: number[] | undefined, fn: (p: Pt) => Pt): number[] | undefined {
  if (!points) return points;
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const p = fn([points[i], points[i + 1]]);
    out.push(p[0], p[1]);
  }
  return out;
}

/** Moves masks and drawings so they stay on the same spot after rotate + crop. */
export function transformShapes(
  masks: Mask[],
  annotations: Annotation[],
  q: number,
  w: number,
  h: number,
  crop: CropBox | null,
): { masks: Mask[]; annotations: Annotation[] } {
  q = ((q % 4) + 4) % 4;
  const cx = crop?.x ?? 0;
  const cy = crop?.y ?? 0;
  const cw = crop?.width ?? (q % 2 ? h : w);
  const ch = crop?.height ?? (q % 2 ? w : h);
  const tp = (p: Pt): Pt => {
    const r = rotPt(p, q, w, h);
    return [r[0] - cx, r[1] - cy];
  };
  const inside = (x: number, y: number, ww: number, hh: number) => x + ww > 0 && y + hh > 0 && x < cw && y < ch;
  const outMasks: Mask[] = [];
  for (const m of masks) {
    const r = rotRect(m.x, m.y, m.w, m.h, q, w, h);
    const nm: Mask = { ...m, x: r.x - cx, y: r.y - cy, w: r.w, h: r.h, points: mapPoints(m.points, tp) };
    if (inside(nm.x, nm.y, nm.w, nm.h)) outMasks.push(nm);
  }
  const outAnn: Annotation[] = [];
  for (const a of annotations) {
    let na: Annotation = { ...a, points: mapPoints(a.points, tp) };
    if (a.x != null && a.y != null) {
      if (a.kind === 'box') {
        const r = rotRect(a.x, a.y, a.w || 0, a.h || 0, q, w, h);
        na = { ...na, x: r.x - cx, y: r.y - cy, w: r.w, h: r.h };
      } else {
        const p = tp([a.x, a.y]);
        na = { ...na, x: p[0], y: p[1] };
      }
    }
    outAnn.push(na);
  }
  return { masks: outMasks, annotations: outAnn };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function extForMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  return 'bin';
}

export function mimeForName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || '';
  return (
    {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      oga: 'audio/ogg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      webm: 'audio/webm',
      flac: 'audio/flac',
    } as Record<string, string>
  )[ext] || 'application/octet-stream';
}
