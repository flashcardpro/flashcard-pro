import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, PackageOpen, AlertTriangle, Layers, Eye, PencilLine, Users, CopyPlus, ArrowRight, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { fetchPublicFile, fileAccess, hasValidToken } from '../lib/drive';
import { importBundle, type ParsedBundle } from '../lib/bundle';
import { primeMediaUrl } from '../lib/media';
import { useLang, useT } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { addSharedCopy, followSharedDeck, joinSharedDeck, readSharedLink } from '../lib/share';
import type { SharedPackage } from '../lib/sharedDeck';
import type { Note } from '../lib/types';
import { Button, Dialog, Empty } from '../components/ui';
import { CardImage } from '../components/CardImage';
import { RichHtml } from '../components/RichHtml';
import { noteTitle } from '../lib/cards';
import { LogoMark } from '../components/Logo';
import { useSignIn } from '../components/SignIn';

const PAGE = 24;

/** A few cards to look at before adding the deck. Photos load straight from the shared link. */
function Preview({ notes, photoFor }: { notes: Note[]; photoFor: (mediaId: string) => Promise<Blob | null> }) {
  const t = useT();
  const [shown, setShown] = useState(PAGE);
  const [ready, setReady] = useState<Set<string>>(() => new Set());
  const visible = notes.slice(0, shown);

  useEffect(() => {
    let alive = true;
    const ids = visible.map((n) => n.image?.mediaId).filter((x): x is string => !!x && !ready.has(x));
    (async () => {
      for (const id of ids) {
        const blob = await photoFor(id).catch(() => null);
        if (!alive) return;
        if (blob) {
          primeMediaUrl('preview-' + id, blob);
          setReady((r) => new Set(r).add(id));
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, notes]);

  return (
    <>
      <h2 className="section-title">{t('Cards in this deck')}</h2>
      <ul className="card-grid">
        {visible.map((n) => (
          <li key={n.id}>
            <article className="card-tile">
              {n.image && (
                <div className="tile-photo">
                  {ready.has(n.image.mediaId) ? (
                    <CardImage image={{ ...n.image, mediaId: 'preview-' + n.image.mediaId }} view={n.type === 'occlusion' ? { mode: 'all' } : { mode: 'none' }} />
                  ) : (
                    <div className="tile-photo-wait">
                      <Loader2 size={20} className="spin" />
                    </div>
                  )}
                </div>
              )}
              <div className="tile-body">{noteTitle(n) ? <p className="tile-title">{noteTitle(n)}</p> : <RichHtml html={n.front} className="tile-title" />}</div>
            </article>
          </li>
        ))}
      </ul>
      {notes.length > shown && (
        <div className="center-row">
          <Button onClick={() => setShown((s) => s + PAGE * 2)}>{t('Show more cards ({n} left)', { n: notes.length - shown })}</Button>
        </div>
      )}
    </>
  );
}

function ErrorView({ message }: { message: string }) {
  const t = useT();
  return (
    <div className="page">
      <Empty icon={<AlertTriangle size={32} />} title={t('This shared deck could not be opened')} action={<Button onClick={() => navigate('/')}>{t('Go home')}</Button>}>
        {message}
      </Empty>
    </div>
  );
}

function LiveShared({ fileId, pkg }: { fileId: string; pkg: SharedPackage }) {
  const t = useT();
  const user = useStore((s) => s.user);
  const joined = useStore((s) => Object.values(s.lib.decks).find((d) => d.share?.fileId === fileId) || null);
  const editable = pkg.mode === 'edit';
  // Someone who only followed the deck can still join in once the owner lets people edit.
  const joinedId = joined && !(editable && joined.share?.role === 'viewer') ? joined.id : null;
  const [busy, setBusy] = useState<'' | 'edit' | 'follow' | 'copy'>('');
  const signIn = useSignIn();
  const root = pkg.decks.find((d) => d.id === pkg.rootId) || pkg.decks[0];
  const photos = Object.values(pkg.media).filter((m) => m.mime.startsWith('image/')).length;

  async function ensureSignedIn(): Promise<boolean> {
    if (user && hasValidToken()) return true;
    if (user) {
      const { reconnect } = await import('../lib/sync');
      try {
        await reconnect();
        return hasValidToken();
      } catch {
        return false;
      }
    }
    return signIn.run();
  }

  async function finishJoin() {
    const id = await joinSharedDeck(fileId, pkg);
    toast.success(t('You can now edit this deck together. Changes sync both ways.'));
    navigate('/deck/' + id);
  }

  // Google asks each new editor to select the deck once (in its own window) before
  // Flashcard Pro may save to it.
  const lang = useLang();
  const [pick, setPick] = useState<{ url: string; waiting: boolean } | null>(null);
  const stopWaiting = useRef<AbortController | null>(null);
  useEffect(() => () => stopWaiting.current?.abort(), []);
  useEffect(() => {
    if (editable && user) void import('../lib/picker').then((m) => m.loadPicker()).catch(() => {});
  }, [editable, user]);

  async function openGoogle() {
    if (!pick) return;
    const { openPickerWindow, waitForAccess } = await import('../lib/picker');
    const popup = openPickerWindow(pick.url);
    if (!popup) {
      toast.error(t('Your browser blocked the Google window. Allow pop-ups for this site, then try again.'));
      return;
    }
    if (pick.waiting) return; // already checking
    setPick({ ...pick, waiting: true });
    stopWaiting.current?.abort();
    const ctl = new AbortController();
    stopWaiting.current = ctl;
    const access = await waitForAccess(fileId, { signal: ctl.signal, popup });
    if (ctl.signal.aborted) return;
    setPick(null);
    if (access === 'none') return;
    if (access === 'read') {
      toast.error(t('Google did not allow editing. Ask the owner to set the link to "Can edit".'));
      return;
    }
    setBusy('edit');
    try {
      await finishJoin();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function act(kind: 'edit' | 'follow' | 'copy') {
    setBusy(kind);
    try {
      if (kind === 'edit') {
        if (!(await ensureSignedIn())) return;
        const access = await fileAccess(fileId);
        if (access === 'edit') return await finishJoin();
        if (access === 'read') throw new Error(t('Google did not allow editing. Ask the owner to set the link to "Can edit".'));
        const { pickerUrl } = await import('../lib/picker');
        const email = useStore.getState().user?.email || '';
        setPick({ url: await pickerUrl(fileId, t('Select this deck so Flashcard Pro can save your edits'), email, lang), waiting: false });
      } else if (kind === 'follow') {
        const id = followSharedDeck(fileId, pkg);
        toast.success(t('Deck added. You will get changes from the owner.'));
        navigate('/deck/' + id);
      } else {
        const id = await addSharedCopy(pkg);
        toast.success(t('A copy was added to your library.'));
        navigate('/deck/' + id);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="page shared-page">
      <header className={`deck-head deck-${root?.color || 'blue'}`}>
        <div className="deck-head-band" />
        <div className="deck-head-body">
          <p className="shared-from">
            <LogoMark size={20} /> {t('Someone shared a deck with you')}
          </p>
          <h1 className="deck-title">{root?.name || t('Shared deck')}</h1>
          {root?.description && <p className="muted">{root.description}</p>}
          <p className="muted">
            <Layers size={15} className="inline-icon" /> {t('{n} cards', { n: pkg.notes.length })}
            {photos > 0 && <>, {t('{n} photos', { n: photos })}</>}
          </p>
          <p>
            <span className="shared-mode-chip">
              {editable ? <PencilLine size={14} /> : <Eye size={14} />} {editable ? t('Anyone with the link can edit') : t('Anyone with the link can view')}
            </span>
          </p>
          <div className="shared-actions">
            {joinedId ? (
              <Button variant="primary" size="lg" icon={<ArrowRight size={18} />} onClick={() => navigate('/deck/' + joinedId)}>
                {t('Open deck')}
              </Button>
            ) : editable ? (
              <Button variant="primary" size="lg" icon={<Users size={18} />} disabled={!!busy} onClick={() => act('edit')}>
                {busy === 'edit' ? t('Joining...') : t('Edit together')}
              </Button>
            ) : (
              <Button variant="primary" size="lg" icon={<PackageOpen size={18} />} disabled={!!busy} onClick={() => act('follow')}>
                {busy === 'follow' ? t('Adding...') : t('Add to my decks')}
              </Button>
            )}
            {joined && !joinedId && (
              <Button variant="ghost" icon={<ArrowRight size={16} />} onClick={() => navigate('/deck/' + joined.id)}>
                {t('Open deck')}
              </Button>
            )}
            <Button variant="ghost" icon={<CopyPlus size={16} />} disabled={!!busy} onClick={() => act('copy')}>
              {busy === 'copy' ? t('Adding...') : t('Add a separate copy')}
            </Button>
          </div>
          <p className="muted small shared-note">
            {joinedId
              ? t('This deck is already in your library and stays in sync with this link.')
              : editable
                ? t('Edit together: sign in with Google. Your edits show up for everyone with the link, and theirs for you. Google may ask you to select the deck once so Flashcard Pro can save to it.')
                : t('Add to my decks: you study the cards and get changes from the owner. Your study progress stays private.')}{' '}
            {t('A separate copy is all yours and never changes with the original.')}
          </p>
        </div>
      </header>
      <Preview notes={pkg.notes} photoFor={async (id) => (pkg.media[id]?.driveId ? fetchPublicFile(pkg.media[id].driveId!) : null)} />
      {signIn.dialogs}
      <Dialog
        open={!!pick}
        onOpenChange={(v) => {
          if (!v) {
            stopWaiting.current?.abort();
            setPick(null);
          }
        }}
        title={t('One more step')}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                stopWaiting.current?.abort();
                setPick(null);
              }}
            >
              {t('Cancel')}
            </Button>
            <Button variant="primary" icon={<ExternalLink size={15} />} onClick={openGoogle}>
              {pick?.waiting ? t('Open the Google window again') : t('Open Google window')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <p>{t('Google keeps your Drive private, so it asks you to select this shared deck once. In the Google window, click the deck, then click Select.')}</p>
          {pick?.waiting && (
            <p className="pick-wait">
              <Loader2 size={16} className="spin" /> {t('Waiting for you to click Select in the Google window...')}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  );
}

function CopyShared({ parsed }: { parsed: ParsedBundle }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const root = parsed.bundle.decks.find((d) => parsed.bundle.rootIds.includes(d.id)) || parsed.bundle.decks[0];
  const files = parsed.files;
  if (!root) return <ErrorView message={t('This link is not a Flashcard Pro deck.')} />;
  return (
    <div className="page shared-page">
      <header className={`deck-head deck-${root.color}`}>
        <div className="deck-head-band" />
        <div className="deck-head-body">
          <p className="shared-from">
            <LogoMark size={20} /> {t('Someone shared a deck with you')}
          </p>
          <h1 className="deck-title">{root.name}</h1>
          {root.description && <p className="muted">{root.description}</p>}
          <p className="muted">
            <Layers size={15} className="inline-icon" /> {t('{n} notes', { n: parsed.bundle.notes.length })}, {t('{n} photos and audio', { n: parsed.bundle.media.length })}
          </p>
          <div className="row-gap">
            <Button
              variant="primary"
              size="lg"
              icon={<PackageOpen size={18} />}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ids = await importBundle(parsed);
                toast.success(t('Deck added to your library.'));
                navigate(ids[0] ? `/deck/${ids[0]}/study/review` : '/');
              }}
            >
              {busy ? t('Adding...') : t('Add to my decks and study')}
            </Button>
          </div>
          <p className="muted small">{t('A copy is added to your library. Changes you make do not affect the original.')}</p>
        </div>
      </header>
      <Preview notes={parsed.bundle.notes} photoFor={async (id) => files.get(id) || null} />
    </div>
  );
}

export function SharedDeckPage({ fileId }: { fileId: string }) {
  const t = useT();
  const [link, setLink] = useState<Awaited<ReturnType<typeof readSharedLink>> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    readSharedLink(fileId)
      .then((l) => alive && setLink(l))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [fileId]);

  const view = useMemo(() => {
    if (!link) return null;
    return link.kind === 'live' ? <LiveShared fileId={fileId} pkg={link.pkg} /> : <CopyShared parsed={link.parsed} />;
  }, [link, fileId]);

  if (error) return <ErrorView message={error} />;
  if (!view) {
    return (
      <div className="page center-page">
        <Loader2 size={30} className="spin" />
        <p>{t('Opening shared deck...')}</p>
      </div>
    );
  }
  return view;
}
