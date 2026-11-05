import { useEffect, useMemo, useState } from 'react';
import { Loader2, PackageOpen, AlertTriangle, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { fetchPublicFile } from '../lib/drive';
import { readBundle, importBundle, type ParsedBundle } from '../lib/bundle';
import { primeMediaUrl } from '../lib/media';
import { useT } from '../lib/i18n';
import { navigate } from '../lib/router';
import { Button, Empty } from '../components/ui';
import { CardImage } from '../components/CardImage';
import { RichHtml } from '../components/RichHtml';
import { noteTitle } from '../lib/cards';
import { LogoMark } from '../components/Logo';

export function SharedDeckPage({ fileId }: { fileId: string }) {
  const t = useT();
  const [parsed, setParsed] = useState<ParsedBundle | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const blob = await fetchPublicFile(fileId);
        const p = await readBundle(blob);
        // Show photos straight from the downloaded file for the preview.
        for (const [id, b] of p.files) primeMediaUrl('preview-' + id, b);
        if (alive) setParsed(p);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fileId]);

  const root = parsed?.bundle.decks.find((d) => parsed.bundle.rootIds.includes(d.id)) || parsed?.bundle.decks[0];
  const sample = useMemo(() => (parsed ? parsed.bundle.notes.slice(0, 6) : []), [parsed]);

  if (error) {
    return (
      <div className="page">
        <Empty icon={<AlertTriangle size={32} />} title={t('This shared deck could not be opened')} action={<Button onClick={() => navigate('/')}>{t('Go home')}</Button>}>
          {error}
        </Empty>
      </div>
    );
  }
  if (!parsed || !root) {
    return (
      <div className="page center-page">
        <Loader2 size={30} className="spin" />
        <p>{t('Opening shared deck...')}</p>
      </div>
    );
  }
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
      <h2 className="section-title">{t('A few cards from this deck')}</h2>
      <ul className="card-grid">
        {sample.map((n) => (
          <li key={n.id}>
            <article className="card-tile">
              {n.image && (
                <div className="tile-photo">
                  <CardImage image={{ ...n.image, mediaId: 'preview-' + n.image.mediaId }} view={n.type === 'occlusion' ? { mode: 'all' } : { mode: 'none' }} />
                </div>
              )}
              <div className="tile-body">{noteTitle(n) ? <p className="tile-title">{noteTitle(n)}</p> : <RichHtml html={n.front} className="tile-title" />}</div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
