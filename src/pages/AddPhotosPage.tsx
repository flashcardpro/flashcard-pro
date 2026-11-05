import { useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCheck, ImagePlus, Images, Layers, Repeat, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePhotoQueue, setPreferredPhotoType } from '../lib/photoQueue';
import { saveNotes, saveNote } from '../lib/store';
import { useT } from '../lib/i18n';
import { navigate } from '../lib/router';
import { NoteEditor, noteProblem } from '../components/NoteEditor';
import { CardThumb } from '../components/CardFace';
import { Button, Empty, IconButton, Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger, Tooltip } from '../components/ui';
import { DeckPicker } from '../components/DeckBits';
import { usePhotoPicker } from '../components/Shell';
import type { Note, NoteType } from '../lib/types';

/** Notes that cannot be saved as they are get a sensible fallback instead of being lost. */
function finalize(n: Note): Note {
  if (n.type === 'occlusion' && (!n.image || n.image.masks.length === 0)) return { ...n, type: 'basic', image: n.image ? { ...n.image, side: 'front' } : null };
  return n;
}

export function AddPhotosPage() {
  const t = useT();
  const { drafts, index, adding, setDraft, setIndex, remove, clear, deckId } = usePhotoQueue();
  const picker = usePhotoPicker();
  const cur = drafts[index];

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (usePhotoQueue.getState().drafts.length) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  if (!drafts.length) {
    if (adding) {
      return (
        <div className="page center-page">
          <Loader2 size={32} className="spin" />
          <p>{t('Preparing your photos...')}</p>
        </div>
      );
    }
    return (
      <div className="page">
        <Empty
          icon={<ImagePlus size={36} />}
          title={t('Add photos to make cards')}
          action={
            <Button variant="primary" icon={<ImagePlus size={16} />} onClick={picker.open}>
              {t('Choose photos')}
            </Button>
          }
        >
          {t('Pick as many as you like. You can hide parts, draw, crop and write answers on each one.')}
        </Empty>
        {picker.inputs}
      </div>
    );
  }

  function doneTo(target: string | null) {
    clear();
    navigate(target ? '/deck/' + target : '/');
  }

  function saveCurrent() {
    if (!cur) return;
    const n = finalize(cur);
    const problem = noteProblem(n);
    if (problem) {
      toast.error(t(problem));
      return;
    }
    saveNote(n);
    localStorage.setItem('fcp-last-deck', n.deckId);
    const left = drafts.length - 1;
    remove(index);
    if (left === 0) {
      toast.success(t('Card saved.'));
      doneTo(n.deckId);
    } else toast.success(t('Saved. {n} photos left.', { n: left }));
  }

  function saveAll() {
    const ready = drafts.map(finalize);
    const bad = ready.filter((n) => noteProblem(n));
    const good = ready.filter((n) => !noteProblem(n));
    saveNotes(good);
    if (good[0]) localStorage.setItem('fcp-last-deck', good[0].deckId);
    if (bad.length) {
      usePhotoQueue.setState({ drafts: bad, index: 0 });
      toast.error(t('{a} saved. {b} still need something before they can be saved.', { a: good.length, b: bad.length }));
    } else {
      toast.success(good.length === 1 ? t('1 card saved.') : t('{n} photo cards saved.', { n: good.length }));
      doneTo(good[0]?.deckId || deckId);
    }
  }

  function applyTypeToAll(type: NoteType) {
    setPreferredPhotoType(type);
    usePhotoQueue.setState({ drafts: drafts.map((d) => ({ ...d, type })) });
  }

  const typeLabel = (ty: NoteType) => ({ basic: t('Photo card'), reverse: t('Both ways'), cloze: t('Fill the blank'), occlusion: t('Hide parts of photo') })[ty];

  return (
    <div className="page photos-page">
      <header className="page-head">
        <IconButton label={t('Back')} onClick={() => history.back()}>
          <ArrowLeft size={20} />
        </IconButton>
        <div>
          <h1 className="page-title">{t('Edit your photos')}</h1>
          <p className="muted small">
            {t('Photo {a} of {b}', { a: index + 1, b: drafts.length })}
            {adding > 0 && <span className="adding-more">{t('adding {n} more...', { n: adding })}</span>}
          </p>
        </div>
        <span className="toolbar-flex" />
        <div className="photos-all">
          <Menu>
            <MenuTrigger asChild>
              <button className="btn btn-secondary btn-sm">
                <Images size={15} />
                <span>{t('Card type for all')}</span>
              </button>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>{t('Use for every photo')}</MenuLabel>
              <MenuItem icon={<Images size={15} />} hint={t('Hide labels, words or parts')} onSelect={() => applyTypeToAll('occlusion')}>
                {t('Hide parts of photo')}
              </MenuItem>
              <MenuItem icon={<Layers size={15} />} hint={t('Photo on one side, answer on the other')} onSelect={() => applyTypeToAll('basic')}>
                {t('Photo card')}
              </MenuItem>
              <MenuItem icon={<Repeat size={15} />} hint={t('Asked in both directions')} onSelect={() => applyTypeToAll('reverse')}>
                {t('Both ways')}
              </MenuItem>
            </MenuContent>
          </Menu>
          <div className="photos-deck">
            <span className="muted small">{t('Deck for all')}</span>
            <DeckPicker value={cur?.deckId || deckId || ''} onChange={(d) => usePhotoQueue.setState({ drafts: drafts.map((x) => ({ ...x, deckId: d })), deckId: d })} />
          </div>
        </div>
      </header>

      <ol className="filmstrip" aria-label={t('Photos waiting')}>
        {drafts.map((d, i) => (
          <li key={d.id} className={'film-item' + (i === index ? ' is-on' : '') + (noteProblem(finalize(d)) ? ' is-warn' : '')}>
            <button className="film-thumb" onClick={() => setIndex(i)} aria-label={t('Photo {a} of {b}', { a: i + 1, b: drafts.length })}>
              <CardThumb note={d} />
              <span className="film-badge">{d.type === 'occlusion' && d.image?.masks.length ? d.image.masks.length : i + 1}</span>
            </button>
            <Tooltip text={t('Remove this photo')}>
              <button className="film-remove" aria-label={t('Remove this photo')} onClick={() => remove(i)}>
                <X size={12} />
              </button>
            </Tooltip>
          </li>
        ))}
        <li>
          <button className="film-add" onClick={picker.open} aria-label={t('Add more photos')}>
            {adding ? <Loader2 size={18} className="spin" /> : <ImagePlus size={18} />}
          </button>
        </li>
      </ol>

      {cur && (
        <>
          <p className="photo-type-note">
            {t('This photo becomes')}: <b>{typeLabel(cur.type)}</b>
            {cur.type === 'occlusion' && !cur.image?.masks.length && <span className="muted"> - {t('drag over the parts to hide. With nothing hidden it is saved as a photo card.')}</span>}
          </p>
          <NoteEditor key={cur.id} note={cur} onChange={(n) => setDraft(index, n)} showDeck={false} />
        </>
      )}

      <footer className="sticky-actions">
        <Button variant="ghost" icon={<ArrowLeft size={16} />} disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <span className="hide-sm">{t('Previous')}</span>
        </Button>
        <Button variant="ghost" disabled={index >= drafts.length - 1} onClick={() => setIndex(index + 1)}>
          <span className="hide-sm">{t('Skip for now')}</span>
          <ArrowRight size={16} />
        </Button>
        <span className="toolbar-flex" />
        <Button icon={<Check size={16} />} onClick={saveCurrent}>
          {drafts.length > 1 ? t('Save and next') : t('Save card')}
        </Button>
        {drafts.length > 1 && (
          <Button variant="primary" icon={<CheckCheck size={16} />} onClick={saveAll}>
            {t('Save all {n}', { n: drafts.length })}
          </Button>
        )}
      </footer>
      {picker.inputs}
    </div>
  );
}
