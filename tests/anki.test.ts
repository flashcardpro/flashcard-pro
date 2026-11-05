import { describe, expect, it, vi } from 'vitest';
import path from 'path';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({ default: path.resolve('node_modules/sql.js/dist/sql-wasm.wasm') }));

import { parseApkg } from '../src/lib/anki';

async function makeApkg(): Promise<Blob> {
  const SQL = await initSqlJs({ locateFile: () => path.resolve('node_modules/sql.js/dist/sql-wasm.wasm') });
  const db = new SQL.Database();
  db.run('create table col (models text, decks text)');
  db.run('create table notes (id integer, mid integer, flds text, tags text)');
  db.run('create table cards (nid integer, did integer, ord integer)');
  const models = {
    '1': { name: 'Basic (and reversed card)', type: 0, flds: [{ name: 'Front' }, { name: 'Back' }] },
    '2': { name: 'Cloze', type: 1, flds: [{ name: 'Text' }, { name: 'Back Extra' }] },
  };
  const decks = { '10': { name: 'Biology::Cells' }, '1': { name: 'Default' } };
  db.run('insert into col values (?, ?)', [JSON.stringify(models), JSON.stringify(decks)]);
  db.run('insert into notes values (?, ?, ?, ?)', [100, 1, 'Mitochondria\x1fPowerhouse of the cell', ' cell bio ']);
  db.run('insert into notes values (?, ?, ?, ?)', [101, 2, 'DNA lives in the {{c1::nucleus}}\x1fExtra info', '']);
  db.run('insert into notes values (?, ?, ?, ?)', [102, 1, '<script>alert(1)</script>Safe\x1fok', '']);
  db.run('insert into cards values (100, 10, 0)');
  db.run('insert into cards values (101, 10, 0)');
  db.run('insert into cards values (102, 1, 0)');
  const bytes = db.export();
  const zip = new JSZip();
  zip.file('collection.anki2', bytes);
  zip.file('media', '{}');
  return new Blob([await zip.generateAsync({ type: 'uint8array' }) as BlobPart]);
}

describe('Anki import', () => {
  it('reads decks, basic, reverse and cloze notes, and strips scripts', async () => {
    const r = await parseApkg(await makeApkg());
    expect(r.decks.map((d) => d.name).sort()).toEqual(['Biology', 'Cells', 'Imported']);
    const cells = r.decks.find((d) => d.name === 'Cells')!;
    const bio = r.decks.find((d) => d.name === 'Biology')!;
    expect(cells.parentId).toBe(bio.id);
    const basic = r.notes.find((n) => n.front.includes('Mitochondria'))!;
    expect(basic.type).toBe('reverse');
    expect(basic.tags).toEqual(['cell', 'bio']);
    expect(basic.deckId).toBe(cells.id);
    const cloze = r.notes.find((n) => n.type === 'cloze')!;
    expect(cloze.front).toContain('{{c1::nucleus}}');
    expect(cloze.extra).toContain('Extra info');
    const unsafe = r.notes.find((n) => n.front.includes('Safe'))!;
    expect(unsafe.front).not.toContain('script');
  });
});
