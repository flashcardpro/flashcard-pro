import { useMemo, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { FileUp, Loader2, Upload, ClipboardPaste, PackageOpen, Check, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, putAll, saveNotes, createDeck, addXp, checkBadges } from '../lib/store';
import { putMediaBlob } from '../lib/db';
import { useT } from '../lib/i18n';
import { navigate } from '../lib/router';
import { parseApkg, type AnkiImport } from '../lib/anki';
import { readBundle, importBundle, type ParsedBundle } from '../lib/bundle';
import { parseTermList, guessOptions, textToHtml, type TextImportOptions } from '../lib/textImport';
import { syncCardsForNote } from '../lib/cards';
import { blankNote } from '../lib/store';
import { Button, Field, Select, Switch, DeckSwatch } from '../components/ui';
import { now } from '../lib/util';

function FileDrop({ accept, onFile, label, hint }: { accept: string; onFile: (f: File) => void; label: string; hint: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={'file-drop drop-local' + (over ? ' is-over' : '')}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      onClick={() => ref.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && ref.current?.click()}
    >
      <FileUp size={28} />
      <b>{label}</b>
      <span className="muted small">{hint}</span>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function AnkiTab() {
  const t = useT();
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<AnkiImport | null>(null);
  const [name, setName] = useState('');

  async function load(f: File) {
    setResult(null);
    setName(f.name);
    setBusy(t('Opening file'));
    try {
      const r = await parseApkg(f, (m) => setBusy(t(m)));
      setResult(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function doImport() {
    if (!result) return;
    setBusy(t('Importing'));
    try {
      for (const m of result.media) await putMediaBlob(m.meta.id, m.blob);
      const t0 = now();
      useStore.getState().mutate((lib) => {
        putAll(lib, 'media', result.media.map((m) => m.meta));
        putAll(lib, 'decks', result.decks);
        putAll(lib, 'notes', result.notes);
        for (const n of result.notes) putAll(lib, 'cards', syncCardsForNote(lib, n, t0).upserts);
      });
      addXp(10, 'import');
      checkBadges();
      toast.success(t('Imported {n} notes from Anki.', { n: result.notes.length }));
      const root = result.decks.find((d) => !d.parentId);
      navigate(root ? '/deck/' + root.id : '/');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="stack">
      <p className="muted">{t('In Anki, choose File, then Export, pick "Anki Deck Package (.apkg)", and include media. Both old and new Anki files work, including image occlusion cards.')}</p>
      <FileDrop accept=".apkg,.colpkg" onFile={load} label={t('Choose an .apkg file')} hint={t('or drop it here')} />
      {busy && (
        <p className="busy">
          <Loader2 size={16} className="spin" /> {busy}
        </p>
      )}
      {result && (
        <div className="import-preview">
          <h3>{name}</h3>
          <ul className="import-stats">
            <li>
              <b>{result.notes.length}</b> {t('notes')}
            </li>
            <li>
              <b>{result.decks.length}</b> {t('decks')}
            </li>
            <li>
              <b>{result.media.filter((m) => m.meta.mime.startsWith('image/')).length}</b> {t('photos')}
            </li>
            <li>
              <b>{result.media.filter((m) => m.meta.mime.startsWith('audio/')).length}</b> {t('audio clips')}
            </li>
            {result.notes.some((n) => n.type === 'occlusion') && (
              <li>
                <b>{result.notes.filter((n) => n.type === 'occlusion').length}</b> {t('image occlusion notes')}
              </li>
            )}
          </ul>
          {result.skipped > 0 && <p className="muted small">{t('{n} empty or unreadable notes were skipped.', { n: result.skipped })}</p>}
          <ul className="import-decks">
            {result.decks.slice(0, 12).map((d) => (
              <li key={d.id}>
                <DeckSwatch color={d.color} /> {d.name} <span className="muted">{result.notes.filter((n) => n.deckId === d.id).length}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('Study progress from Anki is not copied; cards start as new.')}</p>
          <Button variant="primary" icon={<Check size={16} />} onClick={doImport} disabled={!!busy}>
            {t('Import {n} notes', { n: result.notes.length })}
          </Button>
        </div>
      )}
    </div>
  );
}

function TextTab() {
  const t = useT();
  const [text, setText] = useState('');
  const [opts, setOpts] = useState<TextImportOptions>({ termSep: 'tab', cardSep: 'newline' });
  const [flip, setFlip] = useState(false);
  const [target, setTarget] = useState<string>('__new');
  const [newName, setNewName] = useState('');
  const rows = useMemo(() => {
    const r = parseTermList(text, opts).filter(([a, b]) => a || b);
    return flip ? r.map(([a, b]) => [b, a] as [string, string]) : r;
  }, [text, opts, flip]);

  function onPaste(v: string) {
    setText(v);
    if (!text.trim() && v.trim()) setOpts(guessOptions(v));
  }

  function doImport() {
    if (!rows.length) return;
    const deckId = target === '__new' ? createDeck(newName.trim() || t('Imported cards'), 'teal').id : target;
    const base = now();
    const notes = rows.map(([front, back], i) => ({ ...blankNote(deckId, 'basic'), front: textToHtml(front), back: textToHtml(back), createdAt: base + i }));
    saveNotes(notes);
    addXp(10, 'import');
    toast.success(t('Imported {n} cards.', { n: notes.length }));
    navigate('/deck/' + deckId);
  }

  return (
    <div className="stack">
      <p className="muted">{t('In Quizlet, open your set, choose the three dots menu, then Export, and copy the text. Paste it below. Any list of terms and definitions works, one per line.')}</p>
      <textarea className="input mono" rows={8} value={text} onChange={(e) => onPaste(e.target.value)} placeholder={'photosynthesis\thow plants make food from light\nmitochondria\tpowerhouse of the cell'} aria-label={t('Text to import')} />
      <div className="row-gap wrap">
        <FileDrop
          accept=".txt,.csv,.tsv"
          onFile={async (f) => {
            const v = await f.text();
            setText(v);
            setOpts(guessOptions(v));
          }}
          label={t('Or choose a .csv or .txt file')}
          hint=""
        />
      </div>
      <div className="grid-3">
        <Field label={t('Between term and definition')}>
          <Select
            value={opts.termSep}
            onChange={(v) => setOpts({ ...opts, termSep: v as TextImportOptions['termSep'] })}
            label={t('Between term and definition')}
            options={[
              { value: 'tab', label: t('Tab') },
              { value: 'comma', label: t('Comma') },
              { value: 'dash', label: t('Dash ( - )') },
              { value: 'custom', label: t('Custom') },
            ]}
          />
          {opts.termSep === 'custom' && <input className="input input-sm" value={opts.customTerm || ''} onChange={(e) => setOpts({ ...opts, customTerm: e.target.value })} placeholder=":" aria-label={t('Custom separator')} />}
        </Field>
        <Field label={t('Between cards')}>
          <Select
            value={opts.cardSep}
            onChange={(v) => setOpts({ ...opts, cardSep: v as TextImportOptions['cardSep'] })}
            label={t('Between cards')}
            options={[
              { value: 'newline', label: t('New line') },
              { value: 'semicolon', label: t('Semicolon') },
              { value: 'custom', label: t('Custom') },
            ]}
          />
          {opts.cardSep === 'custom' && <input className="input input-sm" value={opts.customCard || ''} onChange={(e) => setOpts({ ...opts, customCard: e.target.value })} placeholder="\n\n" aria-label={t('Custom separator')} />}
        </Field>
        <Field label={t('Add to')}>
          <Select
            value={target}
            onChange={setTarget}
            label={t('Add to')}
            options={[{ value: '__new', label: t('A new deck') }, ...Object.values(useStore.getState().lib.decks).map((d) => ({ value: d.id, label: <span className="deck-opt"><DeckSwatch color={d.color} />{d.name}</span> }))]}
          />
          {target === '__new' && <input className="input input-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('Deck name')} aria-label={t('Deck name')} />}
        </Field>
      </div>
      <label className="inline-switch">
        <Switch checked={flip} onChange={setFlip} label={t('Swap front and back')} />
        <ArrowLeftRight size={15} /> {t('Swap front and back')}
      </label>
      {rows.length > 0 && (
        <div className="import-table">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Front')}</th>
                <th>{t('Back')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map(([a, b], i) => (
                <tr key={i}>
                  <td>{a}</td>
                  <td>{b || <span className="muted">{t('(empty)')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 8 && <p className="muted small">{t('and {n} more', { n: rows.length - 8 })}</p>}
        </div>
      )}
      <Button variant="primary" icon={<ClipboardPaste size={16} />} disabled={!rows.length} onClick={doImport}>
        {rows.length ? t('Import {n} cards', { n: rows.length }) : t('Paste something to import')}
      </Button>
    </div>
  );
}

function NativeTab() {
  const t = useT();
  const [parsed, setParsed] = useState<ParsedBundle | null>(null);
  const [parent, setParent] = useState('');
  async function load(f: File) {
    try {
      setParsed(await readBundle(f));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div className="stack">
      <p className="muted">{t('Open a deck file that someone sent you, or a backup you downloaded from Settings.')}</p>
      <FileDrop accept=".fcpro,.zip" onFile={load} label={t('Choose a .fcpro file')} hint={t('or drop it here')} />
      {parsed && (
        <div className="import-preview">
          <ul className="import-stats">
            <li>
              <b>{parsed.bundle.notes.length}</b> {t('notes')}
            </li>
            <li>
              <b>{parsed.bundle.decks.length}</b> {t('decks')}
            </li>
            <li>
              <b>{parsed.bundle.media.length}</b> {t('photos and audio')}
            </li>
          </ul>
          <ul className="import-decks">
            {parsed.bundle.decks.slice(0, 12).map((d) => (
              <li key={d.id}>
                <DeckSwatch color={d.color} /> {d.name}
              </li>
            ))}
          </ul>
          <Field label={t('Put inside an existing deck (optional)')}>
            <Select value={parent || 'none'} onChange={(v) => setParent(v === 'none' ? '' : v)} label={t('Parent deck')} options={[{ value: 'none', label: t('None (top level)') }, ...Object.values(useStore.getState().lib.decks).map((d) => ({ value: d.id, label: d.name }))]} />
          </Field>
          <Button
            variant="primary"
            icon={<PackageOpen size={16} />}
            onClick={async () => {
              const ids = await importBundle(parsed, parent || null);
              toast.success(t('Deck imported.'));
              navigate(ids[0] ? '/deck/' + ids[0] : '/');
            }}
          >
            {t('Import deck')}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ImportPage() {
  const t = useT();
  return (
    <div className="page import-page">
      <header className="page-head">
        <h1 className="page-title">{t('Import cards')}</h1>
      </header>
      <Tabs.Root defaultValue="anki" className="tabs">
        <Tabs.List className="tabs-list" aria-label={t('Import from')}>
          <Tabs.Trigger value="anki" className="tab">
            <Upload size={15} /> Anki
          </Tabs.Trigger>
          <Tabs.Trigger value="text" className="tab">
            <ClipboardPaste size={15} /> {t('Quizlet or text')}
          </Tabs.Trigger>
          <Tabs.Trigger value="native" className="tab">
            <PackageOpen size={15} /> {t('Flashcard Pro file')}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="anki" className="tab-panel">
          <AnkiTab />
        </Tabs.Content>
        <Tabs.Content value="text" className="tab-panel">
          <TextTab />
        </Tabs.Content>
        <Tabs.Content value="native" className="tab-panel">
          <NativeTab />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
