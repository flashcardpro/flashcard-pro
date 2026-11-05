export interface OcrBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
}

export interface OcrResult {
  text: string;
  words: OcrBox[];
  lines: OcrBox[];
}

/** Reads text from a photo in the browser. Language data downloads once on first use (about 10 MB). */
export async function recognize(image: Blob, langs: string, onProgress?: (p: number, status: string) => void): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(langs, 1, {
    logger: (m: { progress: number; status: string }) => onProgress?.(m.progress, m.status),
  });
  try {
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
    const words: OcrBox[] = [];
    const lines: OcrBox[] = [];
    for (const block of data.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          const lt = line.text.trim();
          if (lt && line.confidence > 30) lines.push(box(lt, line.bbox, line.confidence));
          for (const w of line.words || []) {
            const wt = w.text.trim();
            if (wt && w.confidence > 40 && /[\p{L}\p{N}]/u.test(wt)) words.push(box(wt, w.bbox, w.confidence));
          }
        }
      }
    }
    return { text: data.text || '', words, lines };
  } finally {
    await worker.terminate();
  }
}

function box(text: string, b: { x0: number; y0: number; x1: number; y1: number }, confidence: number): OcrBox {
  const pad = 2;
  return { text, x: b.x0 - pad, y: b.y0 - pad, w: b.x1 - b.x0 + pad * 2, h: b.y1 - b.y0 + pad * 2, confidence };
}
