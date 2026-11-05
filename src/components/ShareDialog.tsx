import { useState } from 'react';
import { Copy, Download, Link2, Link2Off, LogIn, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { shareDeck, shareLink, unshareDeck } from '../lib/share';
import { buildBundle } from '../lib/bundle';
import { downloadBlob, safeFileName } from '../lib/util';
import { hasValidToken, isDriveConfigured, isShareConfigured } from '../lib/drive';
import { Button, Dialog } from './ui';
import { useSignIn } from './SignIn';

export function ShareDialog({ open, onOpenChange, deckId }: { open: boolean; onOpenChange: (v: boolean) => void; deckId: string }) {
  const t = useT();
  const deck = useStore((s) => s.lib.decks[deckId]);
  const user = useStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const signIn = useSignIn();
  if (!deck) return null;
  const link = deck.shareId ? shareLink(deck.shareId) : '';
  const canLink = isDriveConfigured() && isShareConfigured();

  async function create() {
    setBusy(true);
    try {
      const l = await shareDeck(deckId);
      await navigator.clipboard?.writeText(l).catch(() => {});
      toast.success(t('Link created and copied. Anyone with it can study a copy of this deck.'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    const blob = await buildBundle(useStore.getState().lib, [deckId]);
    downloadBlob(blob, `${safeFileName(deck.name)}.fcpro`);
  }

  async function nativeShare() {
    try {
      if (link && navigator.share) await navigator.share({ title: deck.name, text: t('Study my Flashcard Pro deck: {name}', { name: deck.name }), url: link });
    } catch {
      /* cancelled */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('Share "{name}"', { name: deck.name })} size="md">
      <div className="stack">
        <section className="share-block">
          <h4>
            <Link2 size={17} /> {t('Share by link')}
          </h4>
          <p className="muted">{t('Puts a copy of this deck (cards, photos and voice notes, not your progress) in your Drive and makes it readable by anyone with the link. Updating the link sends your latest changes.')}</p>
          {!canLink ? (
            <p className="notice">{t('Share links need Google sign-in and an API key on this site. You can still send the deck file below.')}</p>
          ) : !user ? (
            <Button variant="primary" icon={<LogIn size={15} />} onClick={signIn.run}>
              {t('Sign in to share by link')}
            </Button>
          ) : link ? (
            <>
              <div className="copy-row">
                <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label={t('Share link')} />
                <Button
                  icon={<Copy size={15} />}
                  onClick={() => {
                    navigator.clipboard?.writeText(link);
                    toast.success(t('Link copied'));
                  }}
                >
                  {t('Copy')}
                </Button>
              </div>
              <div className="row-gap">
                {'share' in navigator && (
                  <Button variant="ghost" icon={<Share2 size={15} />} onClick={nativeShare}>
                    {t('Send...')}
                  </Button>
                )}
                <Button variant="ghost" onClick={create} disabled={busy || !hasValidToken()}>
                  {busy ? t('Updating...') : t('Update shared copy')}
                </Button>
                <Button
                  variant="ghost"
                  icon={<Link2Off size={15} />}
                  onClick={async () => {
                    try {
                      await unshareDeck(deckId);
                      toast(t('Link turned off. People with the old link can no longer open it.'));
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  {t('Stop sharing')}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="primary" icon={<Link2 size={15} />} onClick={create} disabled={busy}>
              {busy ? t('Creating link...') : t('Create share link')}
            </Button>
          )}
        </section>
        <section className="share-block">
          <h4>
            <Download size={17} /> {t('Send the deck file')}
          </h4>
          <p className="muted">{t('Download a .fcpro file and send it on WhatsApp, email or a pen drive. Friends open it from Import.')}</p>
          <Button onClick={download} icon={<Download size={15} />}>
            {t('Download deck file')}
          </Button>
        </section>
      </div>
      {signIn.dialogs}
    </Dialog>
  );
}
