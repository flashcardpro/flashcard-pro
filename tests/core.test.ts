import { describe, expect, it } from 'vitest';
import { clozeNumbers, renderCloze, ordsForNote, syncCardsForNote, faceFor, nextClozeNumber } from '../src/lib/cards';
import { emptySrs, review, statusOf, buildQueue, preview, confidenceToRating, reviewOnDate, dueInDays, dueOnDate, scheduleRating, previewWith, moveDue, relearn } from '../src/lib/srs';
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
  it('one card per photo: all labels are the answer, and switching keeps progress', () => {
    const lib: Library = emptyLibrary();
    const masks = [
      { id: 'a', kind: 'rect' as const, x: 0, y: 0, w: 1, h: 1, label: 'Mercury', group: 1 },
      { id: 'b', kind: 'rect' as const, x: 0, y: 0, w: 1, h: 1, label: 'Venus', group: 2 },
    ];
    const per = note({ type: 'occlusion', image: { mediaId: 'm', width: 1, height: 1, side: 'front', occlusionMode: 'hideAll', annotations: [], masks } });
    const t0 = Date.now();
    for (const c of syncCardsForNote(lib, per).upserts) lib.cards[c.id] = { ...c, srs: review(c.srs, 3, t0) };
    const one = { ...per, image: { ...per.image!, occlusionMode: 'together' as const } };
    expect(ordsForNote(one)).toEqual(['all']);
    const { upserts, deletes } = syncCardsForNote(lib, one);
    expect(deletes.sort()).toEqual(['n1:g1', 'n1:g2']);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].id).toBe('n1:all');
    expect(upserts[0].srs.reps).toBe(1);
    expect(faceFor(one, upserts[0]).answerText).toBe('Mercury, Venus');
    expect(faceFor(one, upserts[0]).maskGroup).toBeUndefined();
    const empty = { ...one, image: { ...one.image!, masks: [] } };
    expect(ordsForNote(empty)).toEqual([]);
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
  it('custom button moves the next review to the chosen day', () => {
    const t0 = new Date(2026, 10, 5, 21, 30).getTime();
    const due = dueInDays(5, t0);
    expect(new Date(due).getDate()).toBe(10);
    expect(new Date(due).getHours()).toBe(4);
    const s = reviewOnDate(emptySrs(t0), due, t0);
    expect(s.due).toBe(due);
    expect(s.state).toBe(2);
    expect(s.reps).toBe(1);
    expect(s.scheduled_days).toBe(4);
    expect(new Date(dueOnDate('2026-12-25')).getDate()).toBe(25);
  });
  it('fixed button times override the automatic gap', () => {
    const t0 = new Date(2026, 10, 5, 21, 30).getTime();
    const times = {
      1: { mode: 'fixed' as const, amount: 5, unit: 'min' as const },
      2: { mode: 'auto' as const, amount: 1, unit: 'day' as const },
      3: { mode: 'fixed' as const, amount: 2, unit: 'day' as const },
      4: { mode: 'fixed' as const, amount: 3, unit: 'hour' as const },
    };
    const again = scheduleRating(emptySrs(t0), 1, t0, 0.9, times);
    expect(again.due).toBe(t0 + 5 * 60_000);
    expect(again.state).toBe(1);
    const good = scheduleRating(emptySrs(t0), 3, t0, 0.9, times);
    expect(good.due).toBe(dueInDays(2, t0));
    expect(good.state).toBe(2);
    const auto = scheduleRating(emptySrs(t0), 2, t0, 0.9, times);
    expect(auto.due).toBe(review(emptySrs(t0), 2, t0).due);
    const p = previewWith(emptySrs(t0), t0, 0.9, times);
    expect(p[1]).toBe(5 * 60_000);
    expect(p[3]).toBe(2 * 86_400_000);
    expect(p[4]).toBe(3 * 3_600_000);
  });
  it('study again: relearn today, or move to a chosen day', () => {
    const t0 = new Date(2026, 10, 5, 21, 30).getTime();
    const reviewed = review(review(emptySrs(t0), 3, t0), 3, t0 + 86_400_000);
    const back = relearn(reviewed, t0 + 2 * 86_400_000);
    expect(back.due).toBe(t0 + 2 * 86_400_000);
    expect(back.state).toBe(3);
    expect(back.lapses).toBe(reviewed.lapses + 1);
    const fresh = relearn(emptySrs(t0), t0);
    expect(fresh.state).toBe(1);
    expect(fresh.stability).toBeGreaterThan(0);
    const later = moveDue(reviewed, dueInDays(10, t0), t0);
    expect(later.due).toBe(dueInDays(10, t0));
    expect(later.state).toBe(2);
    expect(later.stability).toBe(reviewed.stability);
    expect(moveDue(emptySrs(t0), dueInDays(3, t0), t0).state).toBe(2);
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
