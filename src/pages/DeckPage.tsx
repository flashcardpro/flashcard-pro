import { Fragment, useMemo, useState } from 'react';
import { Play, ChevronDown, Brain, PencilLine, ClipboardCheck, Grid3x3, Rocket, Layers, ImagePlus, FileText, Settings2, CalendarClock, ChevronRight, Shuffle, Volume2 } from 'lucide-react';
import { useStore, updateDeck } from '../lib/store';
import { useT } from '../lib/i18n';
import { buildQueue, deckCounts } from '../lib/srs';
import { examPlan } from '../lib/planner';
import { navigate } from '../lib/router';
import { Button, Dialog, Empty, Field, Menu, MenuContent, MenuItem, MenuLabel, MenuSep, MenuTrigger, Progress, Select, Switch } from '../components/ui';
import { StatusBar } from '../components/Charts';
import { CardBrowser } from '../components/CardBrowser';
import { DeckKebab, usePhotoPicker } from '../components/Shell';
import { addPhotos } from '../lib/photoQueue';
import { ColorChooser } from '../components/DeckBits';
import { dayKey } from '../lib/util';
import type { Deck } from '../lib/types';

export const STUDY_MODES = [
  { id: 'review', icon: Brain, label: 'Smart review', hint: 'Spaced repetition. Rate how well you knew it.' },
  { id: 'learn', icon: Layers, label: 'Learn', hint: 'Multiple choice, then typing, until you know them' },
  { id: 'write', icon: PencilLine, label: 'Write', hint: 'Type each answer' },
  { id: 'test', icon: ClipboardCheck, label: 'Test', hint: 'A practice test with a score' },
  { id: 'match', icon: Grid3x3, label: 'Match', hint: 'Race to pair questions with answers' },
  { id: 'gravity', icon: Rocket, label: 'Gravity', hint: 'Type answers before cards fall' },
  { id: 'cram', icon: Shuffle, label: 'Flip through all', hint: 'Every card, any order, no schedule change' },
] as const;

export function StudyMenu({ deckId, due }: { deckId: string; due: number }) {
  const t = useT();
  return (
    <div className="split-btn">
      <Button variant="primary" size="lg" icon={<Play size={18} />} onClick={() => navigate(`/deck/${deckId}/study/review`)} className="split-main">
        {due ? t('Study {n} cards', { n: due }) : t('Study')}
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <button className="btn btn-primary btn-lg split-caret" aria-label={t('Choose a study mode')}>
            <ChevronDown size={18} />
          </button>
        </MenuTrigger>
        <MenuContent className="menu-wide">
          <MenuLabel>{t('Study mode')}</MenuLabel>
          {STUDY_MODES.map((m, i) => (
            <Fragment key={m.id}>
              {i === 1 && <MenuSep />}
              {i === 1 && <MenuLabel>{t('Practice and games (do not change your schedule)')}</MenuLabel>}
              <MenuItem icon={<m.icon size={16} />} hint={t(m.hint)} onSelect={() => navigate(`/deck/${deckId}/study/${m.id}`)}>
                {t(m.label)}
              </MenuItem>
            </Fragment>
          ))}
        </MenuContent>
      </Menu>
    </div>
  );
}

function DeckSettingsDialog({ open, onOpenChange, deck }: { open: boolean; onOpenChange: (v: boolean) => void; deck: Deck }) {
  const t = useT();
  const lib = useStore((s) => s.lib);
  const plan = examPlan(lib, deck);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('Deck settings')} size="md" footer={<Button variant="primary" onClick={() => onOpenChange(false)}>{t('Done')}</Button>}>
      <div className="stack">
        <Field label={t('Name')}>
          <input className="input" value={deck.name} onChange={(e) => updateDeck(deck.id, { name: e.target.value })} />
        </Field>
        <Field label={t('Color')}>
          <ColorChooser value={deck.color} onChange={(color) => updateDeck(deck.id, { color })} />
        </Field>
        <Field label={t('Description')}>
          <textarea className="input" rows={2} value={deck.description} onChange={(e) => updateDeck(deck.id, { description: e.target.value })} placeholder={t('What this deck covers')} />
        </Field>
        <div className="grid-2">
          <Field label={t('New cards per day')}>
            <Select
              value={String(deck.newPerDay)}
              onChange={(v) => updateDeck(deck.id, { newPerDay: Number(v) })}
              options={[0, 5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 9999].map((n) => ({ value: String(n), label: n === 9999 ? t('No limit') : String(n) }))}
              label={t('New cards per day')}
            />
          </Field>
          <Field label={t('Most reviews per day')}>
            <Select
              value={String(deck.reviewsPerDay)}
              onChange={(v) => updateDeck(deck.id, { reviewsPerDay: Number(v) })}
              options={[50, 100, 200, 300, 500, 9999].map((n) => ({ value: String(n), label: n === 9999 ? t('No limit') : String(n) }))}
              label={t('Most reviews per day')}
            />
          </Field>
        </div>
        <Field label={t('Exam date')} hint={t('Flashcard Pro works out how many new cards to learn each day so you finish with two days spare for revision.')}>
          <div className="row-gap">
            <input type="date" className="input" min={dayKey()} value={deck.examDate || ''} onChange={(e) => updateDeck(deck.id, { examDate: e.target.value || null })} />
            {deck.examDate && (
              <Button variant="ghost" onClick={() => updateDeck(deck.id, { examDate: null })}>
                {t('Clear')}
              </Button>
            )}
          </div>
        </Field>
        {plan && plan.neededPerDay > 0 && plan.neededPerDay !== deck.newPerDay && (
          <div className="notice">
            {t('To finish by {date}, learn {n} new cards a day.', { date: deck.examDate || '', n: plan.neededPerDay })}{' '}
            <Button size="sm" onClick={() => updateDeck(deck.id, { newPerDay: plan.neededPerDay })}>
              {t('Use {n} a day', { n: plan.neededPerDay })}
            </Button>
          </div>
        )}
        <Field label={t('Read-aloud language')}>
          <Select
            value={deck.ttsLang || 'auto'}
            onChange={(v) => updateDeck(deck.id, { ttsLang: v === 'auto' ? '' : v })}
            label={t('Read-aloud language')}
            options={[
              { value: 'auto', label: t('Detect from text'), icon: <Volume2 size={14} /> },
              { value: 'en-IN', label: 'English (India)' },
              { value: 'en-US', label: 'English (US)' },
              { value: 'en-GB', label: 'English (UK)' },
              { value: 'hi-IN', label: 'हिन्दी' },
              { value: 'bn-IN', label: 'বাংলা' },
              { value: 'ta-IN', label: 'தமிழ்' },
              { value: 'te-IN', label: 'తెలుగు' },
              { value: 'mr-IN', label: 'मराठी' },
              { value: 'fr-FR', label: 'Français' },
              { value: 'de-DE', label: 'Deutsch' },
              { value: 'es-ES', label: 'Español' },
              { value: 'ja-JP', label: '日本語' },
            ]}
          />
        </Field>
      </div>
    </Dialog>
  );
}

export function DeckPage({ id, addPhotosHint }: { id: string; addPhotosHint?: boolean }) {
  const t = useT();
  const lib = useStore((s) => s.lib);
  const deck = lib.decks[id];
  const [settings, setSettings] = useState(false);
  const [includeSub, setIncludeSub] = useState(true);
  const picker = usePhotoPicker();
  const counts = useMemo(() => (deck ? deckCounts(lib, deck.id) : null), [lib, deck]);
  const due = useMemo(() => (deck ? buildQueue(lib, deck.id).length : 0), [lib, deck]);
  if (!deck || !counts) return <Empty title={t('This deck does not exist')} action={<Button onClick={() => navigate('/')}>{t('Go home')}</Button>} />;
  const crumbs: Deck[] = [];
  let p = deck.parentId ? lib.decks[deck.parentId] : undefined;
  while (p && crumbs.length < 10) {
    crumbs.unshift(p);
    p = p.parentId ? lib.decks[p.parentId] : undefined;
  }
  const subs = Object.values(lib.decks).filter((d) => d.parentId === deck.id).sort((a, b) => a.order - b.order);
  const plan = examPlan(lib, deck);
  return (
    <div className="page deck-page">
      <header className={`deck-head deck-${deck.color}`}>
        <div className="deck-head-band" />
        <div className="deck-head-body">
          {crumbs.length > 0 && (
            <nav className="crumbs" aria-label={t('Parent decks')}>
              {crumbs.map((c) => (
                <span key={c.id}>
                  <a href={'#/deck/' + c.id}>{c.name}</a>
                  <ChevronRight size={14} />
                </span>
              ))}
            </nav>
          )}
          <div className="deck-head-row">
            <div>
              <h1 className="deck-title">{deck.name}</h1>
              {deck.description && <p className="muted">{deck.description}</p>}
            </div>
            <div className="deck-head-actions">
              <StudyMenu deckId={deck.id} due={due} />
              <Button icon={<ImagePlus size={16} />} onClick={picker.open}>
                <span className="hide-sm">{t('Add photos')}</span>
              </Button>
              <Button variant="ghost" icon={<FileText size={16} />} onClick={() => navigate(`/note/new?deck=${deck.id}`)}>
                <span className="hide-sm">{t('New card')}</span>
              </Button>
              <Button variant="ghost" icon={<Settings2 size={16} />} onClick={() => setSettings(true)} aria-label={t('Deck settings')} />
              <DeckKebab deck={deck} />
            </div>
          </div>
          <StatusBar counts={counts} showLegend />
          {plan && (
            <div className={`exam-strip status-${plan.status}`}>
              <CalendarClock size={16} />
              <b>{plan.daysLeft >= 0 ? (plan.daysLeft === 1 ? t('1 day to exam') : t('{n} days to exam', { n: plan.daysLeft })) : t('Exam day has passed')}</b>
              <span className="muted">{plan.neededPerDay > 0 ? t('{n} new cards a day keeps you on track', { n: plan.neededPerDay }) : t('Every card seen. Keep reviewing.')}</span>
              <span className="grow" />
              <span className="exam-ready">{t('{n}% ready', { n: Math.round(plan.readiness * 100) })}</span>
              <Progress value={plan.readiness} tone={plan.status === 'behind' ? 'red' : 'green'} label={t('Ready')} />
            </div>
          )}
        </div>
      </header>

      {addPhotosHint && (
        <div
          className="drop-panel drop-local"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) addPhotos(e.dataTransfer.files, deck.id);
          }}
        >
          <ImagePlus size={22} />
          <span>{t('Drop photos here to add them to {name}', { name: deck.name })}</span>
          <Button variant="primary" onClick={picker.open}>
            {t('Choose photos')}
          </Button>
        </div>
      )}

      {subs.length > 0 && (
        <div className="subdecks">
          {subs.map((s) => (
            <a key={s.id} href={'#/deck/' + s.id} className={`subdeck-chip deck-${s.color}`}>
              <span className="subdeck-band" />
              {s.name}
              <span className="muted">{deckCounts(lib, s.id).total}</span>
            </a>
          ))}
          <label className="inline-switch">
            <Switch checked={includeSub} onChange={setIncludeSub} label={t('Show cards from inner decks')} />
            {t('Include inner decks')}
          </label>
        </div>
      )}

      <CardBrowser deckId={deck.id} includeSub={includeSub} />
      <DeckSettingsDialog open={settings} onOpenChange={setSettings} deck={deck} />
      {picker.inputs}
    </div>
  );
}
