import { buildBundle } from './bundle';
import { hasValidToken, stopSharing, uploadShare } from './drive';
import { addXp, getLib, updateDeck } from './store';
import { siteUrl } from './router';
import { safeFileName } from './util';

export function shareLink(fileId: string) {
  return siteUrl('/shared/' + fileId);
}

/** Uploads a copy of the deck to the owner's Drive and makes it readable by anyone with the link. */
export async function shareDeck(deckId: string): Promise<string> {
  if (!hasValidToken()) throw new Error('Sign in with Google to share by link.');
  const lib = getLib();
  const deck = lib.decks[deckId];
  if (!deck) throw new Error('Deck not found.');
  const blob = await buildBundle(lib, [deckId]);
  const id = await uploadShare(blob, `${safeFileName(deck.name)}.fcpro`, deck.shareId);
  updateDeck(deckId, { shareId: id });
  addXp(20, 'share:' + deckId, 'share:' + deckId);
  return shareLink(id);
}

export async function unshareDeck(deckId: string) {
  const deck = getLib().decks[deckId];
  if (!deck?.shareId) return;
  try {
    await stopSharing(deck.shareId);
  } finally {
    updateDeck(deckId, { shareId: null });
  }
}
