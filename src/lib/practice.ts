import type { Card, Library, Note } from './types';
import { faceFor, type CardFace } from './cards';
import { cardsInDecks, deckDescendants } from './srs';
import { shuffle } from './util';

export interface StudyItem {
  card: Card;
  note: Note;
  face: CardFace;
}

export function studyItems(lib: Library, deckId: string | null): StudyItem[] {
  const ids = deckId ? deckDescendants(lib, deckId) : Object.keys(lib.decks);
  return cardsInDecks(lib, ids)
    .filter((c) => !c.suspended)
    .map((card) => {
      const note = lib.notes[card.noteId];
      return { card, note, face: faceFor(note, card) };
    });
}

/** Cards with a typed answer, needed for multiple choice, typing and games. */
export function withAnswers(items: StudyItem[]): StudyItem[] {
  return items.filter((i) => i.face.answerText.trim().length > 0);
}

export function choicesFor(item: StudyItem, pool: StudyItem[], n = 4): string[] {
  const correct = item.face.answerText;
  const others = shuffle(
    [...new Set(pool.map((p) => p.face.answerText).filter((a) => a && a.toLowerCase() !== correct.toLowerCase()))],
  ).slice(0, n - 1);
  return shuffle([correct, ...others]);
}

/** Orders practice so weak cards (often forgotten, still learning) come first. */
export function practiceOrder(items: StudyItem[]): StudyItem[] {
  return shuffle(items).sort((a, b) => b.card.srs.lapses - a.card.srs.lapses || (a.card.srs.stability || 0) - (b.card.srs.stability || 0));
}
