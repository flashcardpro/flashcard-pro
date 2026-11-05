import { useState, type ReactNode } from 'react';
import { Check, Copy, Download, Eye, Link2, Link2Off, LogIn, LogOut, PencilLine, RefreshCw, Share2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { changeShareMode, leaveSharedDeck, shareLink, startLiveShare, stopLiveShare, syncSharedDeck, unshareDeck, useShareStatus } from '../lib/share';
import { buildBundle } from '../lib/bundle';
import { downloadBlob, safeFileName } from '../lib/util';
import { navigate } from '../lib/router';
import { hasValidToken, isDriveConfigured, isShareConfigured } from '../lib/drive';
import type { Deck, ShareMode } from '../lib/types';
import { Button, Dialog } from './ui';
import { useSignIn } from './SignIn';

/** The deck itself, or the deck above it that is shared (a deck inside a shared deck is shared too). */
function sharedRoot(decks: Record<string, Deck>, id: string): Deck | null {
  let d: Deck | undefined = decks[id];
  for (let i = 0; d && i < 50; i++) {
    if (d.share) return d;
    d = d.parentId ? decks[d.parentId] : undefined;
  }
  return null;
}

function ModeChoice({ value, onChange, disabled }: { value: ShareMode; onChange: (m: ShareMode) => void; disabled?: boolean }) {
  const t = useT();
  const opts: { v: ShareMode; icon: ReactNode; title: string; text: string }[] = [
    { v: 'view', icon: <Eye size={18} />, title: t('Can view'), text: t('People see the cards and can study them. They get your changes but cannot change your deck.') },
    { v: 'edit', icon: <PencilLine size={18} />, title: t('Can edit'), text: t('People sign in with Google and edit the deck with you. Everyone sees the changes.') },
  ];
  return (
    <div className="share-modes" role="radiogroup" aria-label={t('People with the link')}>
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          className={'share-mode' + (value === o.v ? ' is-on' : '')}
          disabled={disabled}
          onClick={() => value !== o.v && onChange(o.v)}
        >
          <span className="share-mode-icon">{o.icon}</span>
          <span className="share-mode-text">
            <strong>{o.title}</strong>
            <span>{o.text}</span>
          </span>
          <span className="share-mode-tick" aria-hidden>
            {value === o.v && <Check size={15} />}
          </span>
        </button>
      ))}
    </div>
  );
}

function CopyLink({ link }: { link: string }) {
  const t = useT();
  return (
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
  );
}

export function ShareDialog({ open, onOpenChange, deckId }: { open: boolean; onOpenChange: (v: boolean) => void; deckId: string }) {
  const t = useT();
  const deck = useStore((s) => s.lib.decks[deckId]);
  const decks = useStore((s) => s.lib.decks);
  const user = useStore((s) => s.user);
  const status = useShareStatus((s) => s[deckId]);
  const [mode, setMode] = useState<ShareMode>('view');
  const [busy, setBusy] = useState(false);
  const signIn = useSignIn();
  if (!deck) return null;
  const root = sharedRoot(decks, deckId);
  const share = deck.share || null;
  const link = share ? shareLink(share.fileId) : '';
  const canLink = isDriveConfigured() && isShareConfigured();

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const create = () =>
    run(async () => {
      const l = await startLiveShare(deckId, mode);
      await navigator.clipboard?.writeText(l).catch(() => {});
      toast.success(mode === 'edit' ? t('Link copied. Anyone with it can edit this deck with you.') : t('Link copied. Anyone with it can view and study this deck.'));
    });

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

  const statusLine =
    status?.state === 'syncing'
      ? t('Checking for changes...')
      : status?.state === 'no-access'
        ? t('This shared deck could not be reached. The link may have been turned off.')
        : status?.state === 'error'
          ? t('Could not sync the shared deck. It will try again soon.')
          : status?.state === 'view-only'
            ? t('The owner changed the link to view only. You still get their changes, but yours stay here.')
            : t('Changes sync about once a minute while the app is open.');

  let body: ReactNode;
  if (root && root.id !== deckId) {
    body = <p className="muted">{t('This deck is inside the shared deck "{name}". Open that deck to change how it is shared.', { name: root.name })}</p>;
  } else if (share?.role === 'owner') {
    body = (
      <>
        <CopyLink link={link} />
        <h5 className="share-sub">{t('People with the link')}</h5>
        <ModeChoice value={share.mode} disabled={busy} onChange={(m) => run(async () => {
          await changeShareMode(deckId, m);
          toast.success(m === 'edit' ? t('Anyone with the link can now edit.') : t('Anyone with the link can now only view.'));
        })} />
        <p className="muted small share-status">{statusLine}</p>
        <div className="row-gap">
          {'share' in navigator && (
            <Button variant="ghost" icon={<Share2 size={15} />} onClick={nativeShare}>
              {t('Send...')}
            </Button>
          )}
          <Button variant="ghost" icon={<RefreshCw size={15} />} disabled={busy || !hasValidToken()} onClick={() => run(() => syncSharedDeck(deckId))}>
            {t('Sync now')}
          </Button>
          <Button
            variant="ghost"
            icon={<Link2Off size={15} />}
            disabled={busy}
            onClick={() => run(async () => {
              await stopLiveShare(deckId);
              toast(t('Link turned off. People who added the deck keep their copy but stop getting changes.'));
            })}
          >
            {t('Stop sharing')}
          </Button>
        </div>
      </>
    );
  } else if (share) {
    const editing = share.role === 'editor' && share.mode === 'edit';
    body = (
      <>
        <p className="share-joined">
          {editing ? <Users size={17} /> : <Eye size={17} />}
          <span>
            {editing
              ? t('You are editing this deck together with others. Your edits are shared; your study progress is not.')
              : share.role === 'viewer' && share.mode === 'edit'
                ? t('The owner now lets people edit this deck. Click Edit together to send your changes too.')
                : t('You get updates from the person who shared this deck. Changes you make here stay in your library.')}
          </span>
        </p>
        <CopyLink link={link} />
        <p className="muted small share-status">{statusLine}</p>
        <div className="row-gap">
          {share.role === 'viewer' && share.mode === 'edit' && (
            <Button
              variant="primary"
              icon={<Users size={15} />}
              onClick={() => {
                onOpenChange(false);
                navigate('/shared/' + share.fileId);
              }}
            >
              {t('Edit together')}
            </Button>
          )}
          <Button variant="ghost" icon={<RefreshCw size={15} />} disabled={busy || (share.role === 'editor' && !hasValidToken())} onClick={() => run(() => syncSharedDeck(deckId))}>
            {t('Sync now')}
          </Button>
          <Button
            variant="ghost"
            icon={<LogOut size={15} />}
            onClick={() => {
              leaveSharedDeck(deckId);
              toast(t('You left the shared deck. Its cards stay in your library as your own deck.'));
            }}
          >
            {t('Leave shared deck')}
          </Button>
        </div>
      </>
    );
  } else if (!canLink) {
    body = <p className="notice">{t('Share links need Google sign-in and an API key on this site. You can still send the deck file below.')}</p>;
  } else {
    body = (
      <>
        <ModeChoice value={mode} onChange={setMode} disabled={busy} />
        {deck.shareId && <p className="muted small">{t('This deck also has an older copy link. Creating a new link turns the old one off.')}</p>}
        {!user ? (
          <Button variant="primary" icon={<LogIn size={15} />} onClick={signIn.run}>
            {t('Sign in to share by link')}
          </Button>
        ) : (
          <Button variant="primary" icon={<Link2 size={15} />} onClick={create} disabled={busy}>
            {busy ? t('Creating link...') : t('Create link')}
          </Button>
        )}
        {deck.shareId && (
          <Button variant="ghost" size="sm" icon={<Link2Off size={15} />} disabled={busy} onClick={() => run(async () => {
            await unshareDeck(deckId);
            toast(t('Link turned off. People with the old link can no longer open it.'));
          })}>
            {t('Turn off the old link')}
          </Button>
        )}
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('Share "{name}"', { name: deck.name })} size="md">
      <div className="stack">
        <section className="share-block">
          <h4>
            <Link2 size={17} /> {t('Share by link')}
          </h4>
          {!share && !(root && root.id !== deckId) && <p className="muted">{t('Anyone with the link can open this deck. Photos and voice notes are included. Your study progress is never shared.')}</p>}
          {body}
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
