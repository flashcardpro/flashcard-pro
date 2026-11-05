import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Volume2, VolumeX, MoreHorizontal, Pencil, Undo2, EyeOff, Pause, Flag, RotateCcw, Trophy, Grid3x3, ArrowLeft, Clock, Check, Keyboard, CalendarDays, CalendarClock, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, rateCard, undoRating, updateCards, setNotesFlag, relearnCards, getLib, saveResume, updateSettings } from '../lib/store';
import { useStudyAgain } from '../components/StudyAgain';
import { DayPickerDialog } from '../components/DayPicker';
import { useT, useLang } from '../lib/i18n';
import { buildQueue, previewWith, statusOf, confidenceToRating, dueInDays } from '../lib/srs';
import { faceFor } from '../lib/cards';
import { navigate } from '../lib/router';
import { endOfStudyDay, dayKey, formatDay, formatInterval, shuffle } from '../lib/util';
import { speak, stopSpeaking, ttsSupported } from '../lib/speech';
import { REVIEW_XP } from '../lib/gamify';
import { CardFaceView } from '../components/CardFace';
import { Button, IconButton, Menu, MenuContent, MenuItem, MenuLabel, MenuSep, MenuSub, MenuTrigger, Progress, Kbd, Tooltip } from '../components/ui';
import { FLAG_HEX } from '../components/NoteEditor';
import { FLAG_COLORS, type Card, type Rating } from '../lib/types';

const LEARN_AHEAD = 20 * 60_000;

interface UndoEntry {
  before: Card;
  logId: string;
  queue: string[];
  done: number;
}

export function StudyTop({ title, color, progress, onClose, children }: { title: string; color?: string; progress: number; onClose: () => void; children?: React.ReactNode }) {
  const t = useT();
  return (
    <header className="study-top">
      <IconButton label={t('End session')} onClick={onClose}>
        <X size={20} />
      </IconButton>
      <div className="study-title">
        {color && <span className={`deck-swatch deck-${color}`} />}
        <span>{title}</span>
      </div>
      <Progress value={progress} label={t('Session progress')} />
      <div className="study-top-right">{children}</div>
    </header>
  );
}

export function StudyPage({ deckId, mode }: { deckId: string | null; mode: 'review' | 'cram' }) {
  const t = useT();
  const lang = useLang();
  const lib = useStore((s) => s.lib);
  const settings = lib.settings;
  const showCustom = settings.showCustomButton !== false;
  const customDays = [...new Set((settings.customDays?.length ? settings.customDays : [2, 5, 10, 30]).filter((d) => d >= 1))].sort((a, b) => a - b);
  const deck = deckId ? lib.decks[deckId] : null;
  const route = deckId ? `/deck/${deckId}/study/${mode}` : `/study/all/${mode}`;

  const initial = useMemo(() => {
    const l = getLib();
    const r = l.resume.session;
    const sameSession = r && r.deckId === (deckId || 'all') && r.mode === mode && r.day === dayKey();
    if (mode === 'cram') {
      if (sameSession && r) return { queue: r.queue.filter((id) => l.cards[id]), done: r.index, total: r.queue.length };
      const ids = Object.values(l.cards)
        .filter((c) => !c.suspended && (!deckId || deckDescendantsSet(l, deckId).has(c.deckId)))
        .map((c) => c.id);
      return { queue: shuffle(ids), done: 0, total: ids.length };
    }
    const q = buildQueue(l, deckId);
    if (sameSession && r) return { queue: q, done: r.index, total: r.index + q.length };
    return { queue: q, done: 0, total: q.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, mode]);

  const [queue, setQueue] = useState<string[]>(initial.queue);
  const [pos, setPos] = useState(mode === 'cram' ? initial.done : 0);
  const [done, setDone] = useState(initial.done);
  const [total, setTotal] = useState(initial.total);
  const [revealed, setRevealed] = useState(false);
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  const [stats, setStats] = useState({ count: 0, again: 0, xp: 0, ms: 0 });
  const [showKeys, setShowKeys] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [pickDate, setPickDate] = useState(false);
  const missed = useRef(new Set<string>());
  const [relearned, setRelearned] = useState(false);
  const shownAt = useRef(Date.now());
  const sessionStart = useRef(Date.now());

  const cardId = queue[pos];
  const card = cardId ? lib.cards[cardId] : undefined;
  const note = card ? lib.notes[card.noteId] : undefined;
  const finished = !card || !note;

  // Study again from the card menu: keep this session in step with the new schedule.
  const again = useStudyAgain((kind, ids) => {
    if (!card || ids[0] !== card.id || kind === 'new') return;
    const q = queue.slice();
    q.splice(pos, 1);
    if (kind === 'relearn') q.splice(Math.min(q.length, pos + 3), 0, card.id);
    else setTotal(Math.max(done, total - 1));
    setQueue(q);
  });

  // Remember where the person is, so signing in elsewhere resumes here.
  useEffect(() => {
    saveResume({ route, session: { deckId: deckId || 'all', mode, queue: mode === 'cram' ? queue : queue.slice(pos), index: done, day: dayKey() } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, pos]);

  useEffect(() => {
    shownAt.current = Date.now();
    setRevealed(false);
    if (card && note && settings.ttsAuto) {
      const face = faceFor(note, card);
      speak(face.kind === 'occlusion' ? face.promptText || '' : face.promptText, deck?.ttsLang || '');
    }
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, pos]);

  const intervals = useMemo(() => (card && mode === 'review' ? previewWith(card.srs, Date.now(), settings.retention, settings.buttonTimes) : null), [card, mode, settings.retention, settings.buttonTimes, revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  function reveal() {
    if (finished || revealed) return;
    setRevealed(true);
    if (settings.ttsAuto && card && note) speak(faceFor(note, card).answerText, deck?.ttsLang || '');
  }

  function rate(r: Rating, dueAt?: number) {
    if (!card || !note) return;
    const ms = Date.now() - shownAt.current;
    if (mode === 'cram') {
      // Flip-through: missed cards come back later in the same run, schedule untouched.
      const q = queue.slice();
      if (r === 1) {
        q.splice(Math.min(q.length, pos + 4), 0, card.id);
        missed.current.add(card.id);
      }
      setQueue(q);
      setPos(pos + 1);
      setDone(done + 1);
      if (r === 1) setTotal(total + 1);
      setStats((s) => ({ ...s, count: s.count + 1, again: s.again + (r === 1 ? 1 : 0), ms: s.ms + ms }));
      return;
    }
    const res = rateCard(card.id, r, ms, dueAt);
    if (!res) return;
    if (dueAt) toast(t('This card comes back on {date}.', { date: formatDay(dueAt, lang) }));
    setUndo((u) => [...u.slice(-20), { before: res.before, logId: res.logId, queue, done }]);
    const updated = getLib().cards[card.id];
    const rest = queue.slice(pos + 1);
    if (updated && updated.srs.due <= Date.now() + LEARN_AHEAD && updated.srs.due < endOfStudyDay()) {
      const gap = Math.min(rest.length, r === 1 ? 3 : 6);
      rest.splice(gap, 0, card.id);
      setTotal((x) => x + 1);
    }
    setQueue(rest);
    setPos(0);
    setDone(done + 1);
    setStats((s) => ({ count: s.count + 1, again: s.again + (r === 1 ? 1 : 0), xp: s.xp + REVIEW_XP[r], ms: s.ms + ms }));
  }

  function doUndo() {
    const last = undo[undo.length - 1];
    if (!last) return;
    undoRating(last.before, last.logId);
    setUndo(undo.slice(0, -1));
    setQueue([last.before.id, ...last.queue.filter((id) => id !== last.before.id)]);
    setPos(0);
    setDone(last.done);
    setStats((s) => ({ ...s, count: Math.max(0, s.count - 1) }));
    toast(t('Last rating undone.'));
  }

  function skipCard(kind: 'bury' | 'pause') {
    if (!card) return;
    if (kind === 'bury') updateCards([card.id], () => ({ buriedUntil: endOfStudyDay() }));
    else updateCards([card.id], () => ({ suspended: true }));
    const q = queue.slice();
    q.splice(pos, 1);
    setQueue(q);
    setTotal(Math.max(done, total - 1));
    toast(kind === 'bury' ? t('Hidden until tomorrow.') : t('Card paused. Find it in the deck to resume.'));
  }

  // Keyboard: Space/Enter reveal, 1-4 (or 1-5) rate, Ctrl+Z undo, E edit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        doUndo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') navigate(deckId ? '/deck/' + deckId : '/');
      if (finished) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        reveal();
        return;
      }
      if (revealed) {
        if (mode === 'cram') {
          if (e.key === '1') rate(1);
          if (e.key === '2' || e.key === ' ' || e.key === 'Enter') (e.preventDefault(), rate(3));
          return;
        }
        if (settings.ratingStyle === 'confidence' && /^[1-5]$/.test(e.key)) rate(confidenceToRating(Number(e.key) as 1 | 2 | 3 | 4 | 5));
        else if (/^[1-4]$/.test(e.key)) rate(Number(e.key) as Rating);
        else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          rate(3);
        }
      }
      if (revealed && mode === 'review' && showCustom && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setCustomOpen(true);
        return;
      }
      if (e.key.toLowerCase() === 'e' && note) navigate('/note/' + note.id);
      if (e.key.toLowerCase() === 'r' && card && note) speak(revealed ? faceFor(note, card).answerText : faceFor(note, card).promptText, deck?.ttsLang || '');
      if (e.key === '-') skipCard('bury');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const close = () => navigate(deckId ? '/deck/' + deckId : '/');
  const title = deck ? deck.name : t('All decks');
  const progress = total ? done / Math.max(total, done + queue.length - pos) : 1;

  if (finished) {
    const tomorrow = buildQueue(lib, deckId, endOfStudyDay() + 60_000).length;
    const acc = stats.count ? Math.round(((stats.count - stats.again) / stats.count) * 100) : 0;
    return (
      <div className="study-page">
        <StudyTop title={title} color={deck?.color} progress={1} onClose={close} />
        <div className="study-done">
          <div className="done-art" aria-hidden="true">
            <Trophy size={44} />
          </div>
          <h1>{stats.count ? t('Session complete') : t('Nothing to review right now')}</h1>
          {stats.count > 0 ? (
            <ul className="done-stats">
              <li>
                <b>{stats.count}</b>
                <span>{t('cards')}</span>
              </li>
              <li>
                <b>{acc}%</b>
                <span>{t('remembered')}</span>
              </li>
              {mode === 'review' && (
                <li>
                  <b>+{stats.xp}</b>
                  <span>XP</span>
                </li>
              )}
              <li>
                <b>{Math.max(1, Math.round((Date.now() - sessionStart.current) / 60000))}</b>
                <span>{t('minutes')}</span>
              </li>
            </ul>
          ) : (
            <p className="muted">{t('You have studied everything that is due. New cards unlock again tomorrow.')}</p>
          )}
          <p className="muted">{tomorrow ? t('{n} cards are due tomorrow.', { n: tomorrow }) : ''}</p>
          {mode === 'cram' && missed.current.size > 0 && (
            <div className="relearn-offer">
              <p>{t('You marked {n} cards as Still learning. Flip-through does not change your schedule, so add them to your review today if you want to learn them properly.', { n: missed.current.size })}</p>
              <Button
                variant="primary"
                icon={<RotateCcw size={16} />}
                disabled={relearned}
                onClick={() => {
                  relearnCards([...missed.current]);
                  setRelearned(true);
                  toast.success(t('{n} cards added back to learning for today.', { n: missed.current.size }));
                }}
              >
                {relearned ? t('Added to today') : t('Learn these {n} again today', { n: missed.current.size })}
              </Button>
            </div>
          )}
          <div className="row-gap center">
            {deckId && (
              <Button icon={<Grid3x3 size={16} />} onClick={() => navigate(`/deck/${deckId}/study/match`)}>
                {t('Play Match')}
              </Button>
            )}
            {deckId && mode === 'review' && (
              <Button variant="ghost" onClick={() => navigate(`/deck/${deckId}/study/cram`)}>
                {t('Flip through all cards')}
              </Button>
            )}
            <Button variant="primary" icon={<ArrowLeft size={16} />} onClick={close}>
              {deckId ? t('Back to deck') : t('Back home')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const status = statusOf(card);
  const customButton = !showCustom ? null : (
    <Menu open={customOpen} onOpenChange={setCustomOpen}>
      <MenuTrigger asChild>
        <button className="rate-btn r5" aria-label={t('Choose when this card comes back')}>
          <small>
            <CalendarDays size={14} />
          </small>
          <b>{t('Custom')}</b>
          <Kbd>C</Kbd>
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="end" className="custom-due-menu">
        <MenuLabel>{t('Show this card again in')}</MenuLabel>
        {customDays.map((d) => (
          <MenuItem key={d} icon={<CalendarClock size={15} />} hint={formatDay(dueInDays(d), lang)} onSelect={() => rate(3, dueInDays(d))}>
            {t('{n} days', { n: d })}
          </MenuItem>
        ))}
        <MenuSep />
        <MenuItem
          icon={<CalendarDays size={15} />}
          onSelect={() => setPickDate(true)}
        >
          {t('Choose a date...')}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
  const dateDialog = <DayPickerDialog open={pickDate} onOpenChange={setPickDate} onConfirm={(due) => rate(3, due)} />;
  const ratingButtons =
    mode === 'cram' ? (
      <div className="rate-row two">
        <button className="rate-btn r1" onClick={() => rate(1)}>
          <b>{t('Still learning')}</b>
          <Kbd>1</Kbd>
        </button>
        <button className="rate-btn r3" onClick={() => rate(3)}>
          <b>{t('Knew it')}</b>
          <Kbd>2</Kbd>
        </button>
      </div>
    ) : settings.ratingStyle === 'confidence' ? (
      <div className={'rate-row five' + (showCustom ? ' with-custom' : '')} role="group" aria-label={t('How well did you know it?')}>
        {[1, 2, 3, 4, 5].map((c) => {
          const r = confidenceToRating(c as 1 | 2 | 3 | 4 | 5);
          return (
            <button key={c} className={'rate-btn conf c' + c} onClick={() => rate(r)}>
              <b>{c}</b>
              <span>{[t('Not at all'), t('Barely'), t('Somewhat'), t('Mostly'), t('Perfectly')][c - 1]}</span>
              {intervals && <small>{formatInterval(intervals[r], lang)}</small>}
            </button>
          );
        })}
        {customButton}
      </div>
    ) : (
      <div className={'rate-row' + (showCustom ? ' with-custom' : '')} role="group" aria-label={t('How well did you know it?')}>
        {([1, 2, 3, 4] as Rating[]).map((r) => (
          <button key={r} className={'rate-btn r' + r} onClick={() => rate(r)}>
            <small>{intervals ? formatInterval(intervals[r], lang) : ''}</small>
            <b>{[t('Again'), t('Hard'), t('Good'), t('Easy')][r - 1]}</b>
            <Kbd>{r}</Kbd>
          </button>
        ))}
        {customButton}
      </div>
    );

  return (
    <div className="study-page">
      <StudyTop title={title} color={deck?.color} progress={progress} onClose={close}>
        <span className="study-count" aria-label={t('Cards left')}>
          <Clock size={14} /> {Math.max(0, queue.length - pos)}
        </span>
        {ttsSupported() && (
          <IconButton label={settings.ttsAuto ? t('Turn off read-aloud') : t('Read cards aloud automatically')} active={settings.ttsAuto} onClick={() => updateSettings({ ttsAuto: !settings.ttsAuto })}>
            {settings.ttsAuto ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </IconButton>
        )}
        <Menu>
          <MenuTrigger asChild>
            <button className="icon-btn" aria-label={t('Card actions')}>
              <MoreHorizontal size={18} />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Pencil size={15} />} shortcut="E" onSelect={() => navigate('/note/' + note.id)}>
              {t('Edit card')}
            </MenuItem>
            <MenuItem icon={<Volume2 size={15} />} shortcut="R" onSelect={() => speak(revealed ? faceFor(note, card).answerText : faceFor(note, card).promptText, deck?.ttsLang || '')}>
              {t('Read aloud')}
            </MenuItem>
            {mode === 'review' && (
              <MenuItem icon={<Undo2 size={15} />} shortcut="Ctrl Z" disabled={!undo.length} onSelect={doUndo}>
                {t('Undo last rating')}
              </MenuItem>
            )}
            <MenuSep />
            <MenuSub icon={<Flag size={15} />} label={t('Color label')}>
              {FLAG_COLORS.map((f) => (
                <MenuItem key={f} icon={<Flag size={15} fill={FLAG_HEX[f]} color={FLAG_HEX[f]} />} onSelect={() => setNotesFlag([note.id], f)} hint={note.flag === f ? <Check size={14} /> : null}>
                  {t(f[0].toUpperCase() + f.slice(1) + ' label')}
                </MenuItem>
              ))}
              <MenuItem icon={<X size={15} />} onSelect={() => setNotesFlag([note.id], null)}>
                {t('No label')}
              </MenuItem>
            </MenuSub>
            <MenuItem icon={<EyeOff size={15} />} shortcut="-" onSelect={() => skipCard('bury')}>
              {t('Hide until tomorrow')}
            </MenuItem>
            <MenuItem icon={<Pause size={15} />} onSelect={() => skipCard('pause')}>
              {t('Pause this card')}
            </MenuItem>
            {again.items([card.id], MenuItem, MenuSub, MenuSep)}
            <MenuSep />
            <MenuItem icon={<SlidersHorizontal size={15} />} onSelect={() => navigate('/settings?section=buttons')}>
              {t('Change button times')}
            </MenuItem>
            <MenuItem icon={<Keyboard size={15} />} onSelect={() => setShowKeys(!showKeys)}>
              {showKeys ? t('Hide keyboard keys') : t('Show keyboard keys')}
            </MenuItem>
          </MenuContent>
        </Menu>
      </StudyTop>

      <div className="study-stage">
        <div className={'flip' + (revealed ? ' is-revealed' : '')} onClick={() => !revealed && reveal()}>
          <div className="flip-inner">
            <div className={`flip-face index-card deck-${lib.decks[card.deckId]?.color || 'blue'}`} aria-hidden={revealed}>
              <div className="card-corner">
                <span className={'pill status-' + status}>
                  <span className="pill-dot" />
                  {t({ new: 'New', learning: 'Learning', due: 'Due', review: 'Reviewing', mastered: 'Mastered', suspended: 'Paused' }[status])}
                </span>
                {note.flag && <Flag size={14} fill={FLAG_HEX[note.flag]} color={FLAG_HEX[note.flag]} />}
              </div>
              <CardFaceView note={note} card={card} revealed={false} autoAudio={!revealed} />
            </div>
            <div className={`flip-face flip-back index-card deck-${lib.decks[card.deckId]?.color || 'blue'}`} aria-hidden={!revealed}>
              {revealed && <CardFaceView note={note} card={card} revealed autoAudio />}
            </div>
          </div>
        </div>
      </div>

      <footer className={'study-foot' + (showKeys ? ' show-keys' : '')}>
        {!revealed ? (
          <Button variant="primary" size="lg" className="reveal-btn" onClick={reveal}>
            {t('Show answer')} <Kbd>Space</Kbd>
          </Button>
        ) : (
          ratingButtons
        )}
        {revealed && mode === 'review' && (
          <Tooltip text={showCustom ? t('Again: forgot it. Hard: got it with effort. Good: remembered. Easy: instant. Custom: you pick the day.') : t('Again: forgot it. Hard: got it with effort. Good: remembered. Easy: instant.')}>
            <p className="rate-hint">{t('How well did you know it?')}</p>
          </Tooltip>
        )}
      </footer>
      {dateDialog}
      {again.dialog}
    </div>
  );
}


function deckDescendantsSet(lib: ReturnType<typeof getLib>, id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of Object.values(lib.decks)) if (d.parentId && out.has(d.parentId) && !out.has(d.id)) (out.add(d.id), (grew = true));
  }
  return out;
}
