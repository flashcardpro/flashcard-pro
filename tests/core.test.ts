import { describe, expect, it } from 'vitest';
import { clozeNumbers, renderCloze, ordsForNote, syncCardsForNote, faceFor, nextClozeNumber } from '../src/lib/cards';
import { emptySrs, review, statusOf, buildQueue, preview, confidenceToRating } from '../src/lib/srs';
import { mergeLibraries } from '../src/lib/merge';
import { emptyLibrary, newDeck, gradeAnswer, dayKey, formatInterval } from '../src/lib/util';
import { parseTermList, guessOptions, parseCsv } from '../src/lib/textImport';
import { transformShapes } from '../src/lib/image';
import { levelInfo, streak } from '../src/lib/gamify';
import type { Card, Library, Note } from '../src/lib/types';

function note(partial: Partial<Note>): Note {
  return { id: 'n1', deckId: 'd1', type: 'basic', front: '', back: '', extra: '', image: null, audioFront: null, audioBack: null, tags: [], flag: null, createdAt: 1, updatedAt: 1, ...partial };
}

describe('cloze', () => {
  it('finds blank numbers and renders front and back', () => {
    const html = 'The {{c1::heart}} has {{c2::four::number}} chambers, {{c1::really}}.';
    expect(clozeNumbers(html)).toEqual([1, 2]);
    expect(nextClozeNumber(html)).toBe(3);
    expect(renderCloze(html, 2, false)).toBe('The heart has <span class="cloze-blank">number</span> chambers, really.');
    expect(renderCloze(html, 1, true)).toContain('<span class="cloze-answer">heart</span>');
  });
  it('makes one card per blank number', () => {
    const n = note({ type: 'cloze', front: 'a {{c1::x}} b {{c3::y}}' });
    expect(ordsForNote(n)).toEqual(['c1', 'c3']);
    const lib = emptyLibrary();
    const { upserts } = syncCardsForNote(lib, n);
    expect(upserts.map((c) => c.id)).toEqual(['n1:c1', 'n1:c3']);
    expect(faceFor(n, upserts[1]).answerText).toBe('y');
  });
});

describe('occlusion cards', () => {
  it('one card per mask group, answer is the mask label', () => {
    const n = note({
      type: 'occlusion',
      image: {
        mediaId: 'm',
        width: 100,
        height: 100,
        side: 'front',
        occlusionMode: 'hideAll',
        annotations: [],
        masks: [
          { id: 'a', kind: 'rect', x: 0, y: 0, w: 10, h: 10, label: 'Aorta', group: 1 },
          { id: 'b', kind: 'rect', x: 20, y: 0, w: 10, h: 10, label: 'Atrium', group: 2 },
          { id: 'c', kind: 'ellipse', x: 40, y: 0, w: 10, h: 10, label: 'Valve', group: 2 },
        ],
      },
    });
    expect(ordsForNote(n)).toEqual(['g1', 'g2']);
    const lib = emptyLibrary();
    const cards = syncCardsForNote(lib, n).upserts;
    expect(faceFor(n, cards[1]).answerText).toBe('Atrium, Valve');
  });
  it('keeps progress when masks change and removes cards for deleted groups', () => {
    const lib: Library = emptyLibrary();
    const n = note({ type: 'occlusion', image: { mediaId: 'm', width: 1, height: 1, side: 'front', occlusionMode: 'hideAll', annotations: [], masks: [{ id: 'a', kind: 'rect', x: 0, y: 0, w: 1, h: 1, label: '', group: 1 }, { id: 'b', kind: 'rect', x: 0, y: 0, w: 1, h: 1, label: '', group: 2 }] } });
    for (const c of syncCardsForNote(lib, n).upserts) lib.cards[c.id] = { ...c, srs: { ...c.srs, reps: 5 } };
    const edited = { ...n, image: { ...n.image!, masks: [n.image!.masks[0]] } };
    const { upserts, deletes } = syncCardsForNote(lib, edited);
    expect(upserts).toEqual([]);
    expect(deletes).toEqual(['n1:g2']);
  });
});

describe('spaced repetition', () => {
  it('new card becomes learning, then review with growing intervals', () => {
    const t0 = Date.UTC(2026, 0, 1, 10);
    let s = emptySrs(t0);
    s = review(s, 3, t0);
    expect(s.state).not.toBe(0);
    s = review(s, 3, s.due + 1000);
    s = review(s, 3, s.due + 1000);
    expect(s.state).toBe(2);
    const p = preview(s, s.due);
    expect(p[1]).toBeLessThan(p[3]);
    expect(p[3]).toBeLessThan(p[4]);
  });
  it('maps confidence 1-5 to ratings', () => {
    expect([1, 2, 3, 4, 5].map((c) => confidenceToRating(c as 1))).toEqual([1, 2, 3, 3, 4]);
  });
  it('builds a queue that respects the new card limit', () => {
    const lib = emptyLibrary();
    const d = { ...newDeck('Bio'), id: 'd1', newPerDay: 3 };
    lib.decks.d1 = d;
    for (let i = 0; i < 10; i++) {
      const n = note({ id: 'n' + i, createdAt: i });
      lib.notes[n.id] = n;
      for (const c of syncCardsForNote(lib, n).upserts) lib.cards[c.id] = c;
    }
    expect(buildQueue(lib, 'd1').length).toBe(3);
    const c = Object.values(lib.cards)[0] as Card;
    expect(statusOf(c)).toBe('new');
  });
});

describe('sync merge', () => {
  it('newest edit wins, deletions beat older edits, reviews are unioned', () => {
    const a = emptyLibrary();
    const b = emptyLibrary();
    a.decks.x = { ...newDeck('Old'), id: 'x', updatedAt: 10 };
    b.decks.x = { ...newDeck('New'), id: 'x', updatedAt: 20 };
    const t = Date.now();
    a.notes.gone = note({ id: 'gone', updatedAt: t - 10 });
    b.tombstones.gone = t;
    a.reviews.r1 = { id: 'r1', cardId: 'c', deckId: 'x', rating: 3, ts: 1, ms: 1, prevState: 0 };
    b.reviews.r2 = { id: 'r2', cardId: 'c', deckId: 'x', rating: 1, ts: 2, ms: 1, prevState: 0 };
    a.profile.gravityBest = 300;
    b.profile.gravityBest = 120;
    const m = mergeLibraries(a, b);
    expect(m.decks.x.name).toBe('New');
    expect(m.notes.gone).toBeUndefined();
    expect(Object.keys(m.reviews).sort()).toEqual(['r1', 'r2']);
    expect(m.profile.gravityBest).toBe(300);
  });
  it('an edit made after a delete survives', () => {
    const a = emptyLibrary();
    const b = emptyLibrary();
    const t = Date.now();
    a.notes.n = note({ id: 'n', updatedAt: t });
    b.tombstones.n = t - 1000;
    expect(mergeLibraries(a, b).notes.n).toBeDefined();
  });
});

describe('answers and text import', () => {
  it('grades typed answers with typo tolerance', () => {
    expect(gradeAnswer('Mitochondria', 'mitochondria')).toBe('exact');
    expect(gradeAnswer('mitochondira', 'mitochondria')).toBe('close');
    expect(gradeAnswer('nucleus', 'mitochondria')).toBe('wrong');
    expect(gradeAnswer('cat', 'dog / cat')).toBe('exact');
    expect(gradeAnswer('', 'x')).toBe('wrong');
  });
  it('parses Quizlet tab export, dashes and quoted CSV', () => {
    expect(parseTermList('a\tb\nc\td', { termSep: 'tab', cardSep: 'newline' })).toEqual([['a', 'b'], ['c', 'd']]);
    expect(guessOptions('x - y\nz - w')).toEqual({ termSep: 'dash', cardSep: 'newline' });
    expect(parseTermList('x - y\nz - w', { termSep: 'dash', cardSep: 'newline' })).toEqual([['x', 'y'], ['z', 'w']]);
    expect(parseCsv('"a, b",c\n"say ""hi""",d')).toEqual([['a, b', 'c'], ['say "hi"', 'd']]);
    expect(parseTermList('one;two', { termSep: 'custom', customTerm: '=', cardSep: 'semicolon' })).toEqual([['one', ''], ['two', '']]);
  });
});

describe('photo geometry', () => {
  it('moves masks with a clockwise turn and a crop', () => {
    const masks = [{ id: 'm', kind: 'rect' as const, x: 10, y: 20, w: 30, h: 40, label: '', group: 1 }];
    const r = transformShapes(masks, [], 1, 200, 100, null);
    // 90 deg clockwise in a 200x100 image: new x = H - (y + h), new y = x
    expect(r.masks[0]).toMatchObject({ x: 40, y: 10, w: 40, h: 30 });
    const c = transformShapes(masks, [], 0, 200, 100, { x: 5, y: 5, width: 100, height: 80 });
    expect(c.masks[0]).toMatchObject({ x: 5, y: 15 });
    const gone = transformShapes(masks, [], 0, 200, 100, { x: 150, y: 0, width: 50, height: 50 });
    expect(gone.masks.length).toBe(0);
  });
});

describe('gamification and dates', () => {
  it('levels and streaks', () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(299).level).toBe(2);
    const lib = emptyLibrary();
    const day = 86_400_000;
    const now = Date.now();
    for (let i = 0; i < 4; i++) lib.reviews['r' + i] = { id: 'r' + i, cardId: 'c', deckId: 'd', rating: 3, ts: now - i * day, ms: 1, prevState: 2 };
    expect(streak(lib, now).current).toBe(4);
    expect(dayKey(new Date(2026, 4, 10, 2).getTime())).toBe('2026-05-09');
    expect(formatInterval(10 * 60_000)).toBe('10m');
    expect(formatInterval(3 * day)).toBe('3d');
  });
});
