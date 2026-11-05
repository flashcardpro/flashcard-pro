import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, ArrowRight, RotateCcw, Trophy, Timer, Heart, Zap, Volume2, ClipboardCheck, ArrowLeft, Play } from 'lucide-react';
import { useStore, addXp, updateProfile, getLib } from '../lib/store';
import { useT } from '../lib/i18n';
import { navigate } from '../lib/router';
import { studyItems, withAnswers, choicesFor, practiceOrder, type StudyItem } from '../lib/practice';
import { gradeAnswer, shuffle } from '../lib/util';
import { speak } from '../lib/speech';
import { RichHtml } from '../components/RichHtml';
import { CardImage } from '../components/CardImage';
import { Button, Empty, Kbd, Progress, Select, Switch, IconButton } from '../components/ui';
import { StudyTop } from './StudyPage';
import { saveResume } from '../lib/store';

function Prompt({ item, compact = false }: { item: StudyItem; compact?: boolean }) {
  const { note, face } = item;
  return (
    <div className={'prompt' + (compact ? ' is-compact' : '')}>
      {face.kind === 'occlusion' && note.image && <CardImage image={note.image} view={{ mode: 'question', group: face.maskGroup! }} className="prompt-photo" />}
      {face.kind !== 'occlusion' && face.imageSide === 'front' && note.image && <CardImage image={note.image} view={{ mode: 'none' }} className="prompt-photo" />}
      {face.promptHtml && <RichHtml html={face.promptHtml} className="prompt-text" />}
    </div>
  );
}

function NeedAnswers({ deckId }: { deckId: string | null }) {
  const t = useT();
  return (
    <div className="study-page">
      <StudyTop title={t('Practice')} progress={0} onClose={() => navigate(deckId ? '/deck/' + deckId : '/')} />
      <Empty title={t('Not enough cards with written answers')} action={<Button onClick={() => navigate(deckId ? '/deck/' + deckId : '/')}>{t('Back')}</Button>}>
        {t('This mode needs at least 4 cards with a typed answer (for photo cards, type the answer for each hidden part).')}
      </Empty>
    </div>
  );
}

function useDeckInfo(deckId: string | null) {
  const t = useT();
  const deck = useStore((s) => (deckId ? s.lib.decks[deckId] : null));
  return { title: deck?.name || t('All decks'), color: deck?.color, close: () => navigate(deckId ? '/deck/' + deckId : '/'), ttsLang: deck?.ttsLang || '' };
}

function useResumeRoute(deckId: string | null, mode: string) {
  useEffect(() => {
    saveResume({ route: deckId ? `/deck/${deckId}/study/${mode}` : `/study/all/${mode}`, session: null });
  }, [deckId, mode]);
}

function Feedback({ ok, close, answer, onNext, onOverride }: { ok: boolean; close?: boolean; answer: string; onNext: () => void; onOverride?: () => void }) {
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className={'feedback ' + (ok ? 'is-ok' : 'is-bad')} role="status">
      <span className="feedback-icon">{ok ? <Check size={20} /> : <X size={20} />}</span>
      <div className="feedback-body">
        <b>{ok ? (close ? t('Almost. Check the spelling.') : t('Correct')) : t('Not quite')}</b>
        {(!ok || close) && (
          <p>
            {t('Answer')}: <span className="feedback-answer">{answer}</span>
          </p>
        )}
      </div>
      {!ok && onOverride && (
        <Button size="sm" variant="ghost" onClick={onOverride}>
          {t('I was right')}
        </Button>
      )}
      <Button ref={ref} variant="primary" onClick={onNext} icon={<ArrowRight size={16} />}>
        {t('Continue')}
      </Button>
    </div>
  );
}

function TypeAnswer({ onSubmit, placeholder }: { onSubmit: (v: string) => void; placeholder: string }) {
  const t = useT();
  const [v, setV] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form
      className="type-answer"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <input ref={ref} className="input input-lg" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoComplete="off" autoCapitalize="off" spellCheck={false} />
      <Button type="submit" variant="primary" size="lg">
        {t('Check')}
      </Button>
      <Button type="button" variant="ghost" onClick={() => onSubmit('')}>
        {t("Don't know")}
      </Button>
    </form>
  );
}

// ---------------- Learn ----------------
export function LearnMode({ deckId }: { deckId: string | null }) {
  const t = useT();
  const info = useDeckInfo(deckId);
  useResumeRoute(deckId, 'learn');
  const pool = useMemo(() => withAnswers(studyItems(getLib(), deckId)), [deckId]);
  const [stage, setStage] = useState<Map<string, number>>(new Map()); // 0 mcq, 1 write, 2 done
  const [round, setRound] = useState<StudyItem[]>(() => practiceOrder(pool).slice(0, 8));
  const [i, setI] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; close?: boolean; picked?: string; stage: number } | null>(null);
  const [roundsDone, setRoundsDone] = useState(0);

  const item = round[i];
  // While feedback shows, keep the question in the form it was asked.
  const s = result ? result.stage : item ? Math.min(1, stage.get(item.card.id) || 0) : 0;
  const choices = useMemo(() => (item && s === 0 ? choicesFor(item, pool) : []), [item, s, pool]);
  const mastered = [...stage.values()].filter((v) => v >= 2).length;

  useEffect(() => {
    if (!item || result || s !== 0) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) answer(choices[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (pool.length < 4) return <NeedAnswers deckId={deckId} />;

  function answer(given: string) {
    if (!item || result) return;
    const g = s === 0 ? (given === item.face.answerText ? 'exact' : 'wrong') : gradeAnswer(given, item.face.answerText);
    const ok = g !== 'wrong';
    setResult({ ok, close: g === 'close', picked: given, stage: s });
    const m = new Map(stage);
    m.set(item.card.id, ok ? s + 1 : 0);
    setStage(m);
    if (ok) addXp(3, 'practice');
  }

  function override() {
    if (!item) return;
    const m = new Map(stage);
    m.set(item.card.id, s + 1);
    setStage(m);
    setResult({ ok: true, stage: s });
  }

  function next() {
    setResult(null);
    if (i + 1 < round.length) return setI(i + 1);
    // build next round: unfinished first
    const remaining = pool.filter((p) => (stage.get(p.card.id) || 0) < 2);
    if (!remaining.length) {
      setRound([]);
      return;
    }
    const inProgress = remaining.filter((p) => stage.has(p.card.id));
    const fresh = remaining.filter((p) => !stage.has(p.card.id));
    setRound(shuffle([...inProgress, ...practiceOrder(fresh)].slice(0, 8)));
    setI(0);
    setRoundsDone(roundsDone + 1);
  }

  if (!item) {
    return (
      <div className="study-page">
        <StudyTop title={info.title} color={info.color} progress={1} onClose={info.close} />
        <div className="study-done">
          <div className="done-art">
            <Trophy size={44} />
          </div>
          <h1>{t('You learned all {n} cards', { n: pool.length })}</h1>
          <p className="muted">{t('Smart review will bring them back right before you forget.')}</p>
          <div className="row-gap center">
            <Button icon={<RotateCcw size={16} />} onClick={() => (setStage(new Map()), setRound(practiceOrder(pool).slice(0, 8)), setI(0))}>
              {t('Learn again')}
            </Button>
            <Button variant="primary" onClick={info.close}>
              {t('Back to deck')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="study-page">
      <StudyTop title={info.title} color={info.color} progress={mastered / pool.length} onClose={info.close}>
        <span className="study-count">
          {mastered}/{pool.length} {t('learned')}
        </span>
      </StudyTop>
      <div className="practice-stage">
        <div className="practice-card index-card">
          <div className="practice-head">
            <span className={'mode-tag ' + (s === 0 ? 'tag-choice' : 'tag-write')}>{s === 0 ? t('Pick the answer') : t('Type the answer')}</span>
            <IconButton label={t('Read aloud')} onClick={() => speak(item.face.promptText, info.ttsLang)}>
              <Volume2 size={16} />
            </IconButton>
          </div>
          <Prompt item={item} />
        </div>
        {s === 0 ? (
          <div className="choices">
            {choices.map((c, k) => {
              const state = result ? (c === item.face.answerText ? 'is-right' : c === result.picked ? 'is-wrong' : 'is-dim') : '';
              return (
                <button key={c} className={'choice ' + state} disabled={!!result} onClick={() => answer(c)}>
                  <Kbd>{k + 1}</Kbd>
                  <span>{c}</span>
                </button>
              );
            })}
          </div>
        ) : !result ? (
          <TypeAnswer key={item.card.id + 'w'} onSubmit={answer} placeholder={t('Type your answer')} />
        ) : null}
        {result && <Feedback ok={result.ok} close={result.close} answer={item.face.answerText} onNext={next} onOverride={result.stage === 1 && !result.ok ? override : undefined} />}
        <p className="muted small center">{t('Round {n}', { n: roundsDone + 1 })}</p>
      </div>
    </div>
  );
}

// ---------------- Write ----------------
export function WriteMode({ deckId }: { deckId: string | null }) {
  const t = useT();
  const info = useDeckInfo(deckId);
  useResumeRoute(deckId, 'write');
  const pool = useMemo(() => withAnswers(studyItems(getLib(), deckId)), [deckId]);
  const [order, setOrder] = useState(() => practiceOrder(pool));
  const [i, setI] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; close?: boolean } | null>(null);
  const [missed, setMissed] = useState<StudyItem[]>([]);
  const [right, setRight] = useState(0);
  if (pool.length < 1) return <NeedAnswers deckId={deckId} />;
  const item = order[i];

  function submit(v: string) {
    if (!item) return;
    const g = gradeAnswer(v, item.face.answerText);
    const ok = g !== 'wrong';
    setResult({ ok, close: g === 'close' });
    if (ok) {
      setRight((r) => r + 1);
      addXp(3, 'practice');
    } else setMissed((m) => [...m, item]);
  }

  if (!item) {
    return (
      <div className="study-page">
        <StudyTop title={info.title} color={info.color} progress={1} onClose={info.close} />
        <div className="study-done">
          <h1>{t('{a} of {b} correct', { a: right, b: order.length })}</h1>
          {missed.length > 0 && (
            <ul className="missed-list">
              {missed.map((m) => (
                <li key={m.card.id}>
                  <span className="missed-q">{m.face.promptText || t('Photo card')}</span>
                  <span className="missed-a">{m.face.answerText}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="row-gap center">
            {missed.length > 0 && (
              <Button icon={<RotateCcw size={16} />} onClick={() => (setOrder(shuffle(missed)), setMissed([]), setRight(0), setI(0))}>
                {t('Practice the {n} I missed', { n: missed.length })}
              </Button>
            )}
            <Button variant="primary" onClick={info.close}>
              {t('Back to deck')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="study-page">
      <StudyTop title={info.title} color={info.color} progress={i / order.length} onClose={info.close}>
        <span className="study-count">
          {i + 1}/{order.length}
        </span>
      </StudyTop>
      <div className="practice-stage">
        <div className="practice-card index-card">
          <Prompt item={item} />
        </div>
        {!result ? (
          <TypeAnswer key={item.card.id} onSubmit={submit} placeholder={t('Type your answer')} />
        ) : (
          <Feedback
            ok={result.ok}
            close={result.close}
            answer={item.face.answerText}
            onNext={() => (setResult(null), setI(i + 1))}
            onOverride={
              !result.ok
                ? () => {
                    setMissed((m) => m.filter((x) => x !== item));
                    setRight((r) => r + 1);
                    setResult({ ok: true });
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

// ---------------- Test ----------------
type QType = 'choice' | 'truefalse' | 'written';
interface Question {
  item: StudyItem;
  type: QType;
  choices?: string[];
  shown?: string; // for true/false
  truth?: boolean;
}

export function TestMode({ deckId }: { deckId: string | null }) {
  const t = useT();
  const info = useDeckInfo(deckId);
  useResumeRoute(deckId, 'test');
  const pool = useMemo(() => withAnswers(studyItems(getLib(), deckId)), [deckId]);
  const [count, setCount] = useState(String(Math.min(10, pool.length)));
  const [types, setTypes] = useState<Record<QType, boolean>>({ choice: true, truefalse: true, written: true });
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  if (pool.length < 4) return <NeedAnswers deckId={deckId} />;

  function build() {
    const n = count === 'all' ? pool.length : Math.min(pool.length, Number(count));
    const enabled = (Object.keys(types) as QType[]).filter((k) => types[k]);
    const picked = shuffle(pool).slice(0, n);
    const qs: Question[] = picked.map((item, idx) => {
      const type = enabled[idx % enabled.length];
      if (type === 'choice') return { item, type, choices: choicesFor(item, pool) };
      if (type === 'truefalse') {
        const truth = Math.random() < 0.5;
        const wrong = shuffle(pool.filter((p) => p.face.answerText !== item.face.answerText))[0];
        return { item, type, truth: truth || !wrong, shown: truth || !wrong ? item.face.answerText : wrong.face.answerText };
      }
      return { item, type };
    });
    setQuestions(qs);
    setAnswers({});
    setSubmitted(false);
  }

  const isRight = (q: Question, a: string | undefined) => {
    if (a === undefined) return false;
    if (q.type === 'truefalse') return (a === 'true') === q.truth;
    if (q.type === 'choice') return a === q.item.face.answerText;
    return gradeAnswer(a, q.item.face.answerText) !== 'wrong';
  };

  if (!questions) {
    return (
      <div className="study-page">
        <StudyTop title={info.title} color={info.color} progress={0} onClose={info.close} />
        <div className="test-setup index-card">
          <ClipboardCheck size={30} />
          <h1>{t('Set up your test')}</h1>
          <div className="field">
            <label className="field-label">{t('Questions')}</label>
            <Select
              value={count}
              onChange={setCount}
              label={t('Questions')}
              options={[5, 10, 20, 30, 50].filter((n) => n < pool.length).map((n) => ({ value: String(n), label: String(n) })).concat([{ value: 'all', label: t('All {n}', { n: pool.length }) }])}
            />
          </div>
          <div className="field">
            <span className="field-label">{t('Question types')}</span>
            {(
              [
                ['choice', t('Multiple choice')],
                ['truefalse', t('True or false')],
                ['written', t('Written')],
              ] as [QType, string][]
            ).map(([k, label]) => (
              <label key={k} className="inline-switch">
                <Switch checked={types[k]} onChange={(v) => setTypes({ ...types, [k]: v })} label={label} />
                {label}
              </label>
            ))}
          </div>
          <Button variant="primary" size="lg" icon={<Play size={16} />} onClick={build} disabled={!Object.values(types).some(Boolean)}>
            {t('Start test')}
          </Button>
        </div>
      </div>
    );
  }

  const score = submitted ? questions.filter((q, i) => isRight(q, answers[i])).length : 0;
  const answered = Object.keys(answers).length;

  return (
    <div className="study-page">
      <StudyTop title={info.title} color={info.color} progress={submitted ? 1 : answered / questions.length} onClose={info.close}>
        <span className="study-count">
          {answered}/{questions.length}
        </span>
      </StudyTop>
      <div className="test-page">
        {submitted && (
          <div className={'test-score ' + (score / questions.length >= 0.7 ? 'is-good' : 'is-low')}>
            <b>{Math.round((score / questions.length) * 100)}%</b>
            <span>{t('{a} of {b} correct', { a: score, b: questions.length })}</span>
            <div className="row-gap">
              <Button icon={<RotateCcw size={16} />} onClick={build}>
                {t('New test')}
              </Button>
              <Button variant="primary" icon={<ArrowLeft size={16} />} onClick={info.close}>
                {t('Back to deck')}
              </Button>
            </div>
          </div>
        )}
        <ol className="test-list">
          {questions.map((q, i) => {
            const a = answers[i];
            const right = submitted && isRight(q, a);
            return (
              <li key={i} className={'test-q index-card' + (submitted ? (right ? ' is-right' : ' is-wrong') : '')}>
                <span className="test-num">{i + 1}</span>
                <Prompt item={q.item} compact />
                {q.type === 'truefalse' && (
                  <>
                    <p className="tf-shown">
                      {t('Answer')}: <b>{q.shown}</b>
                    </p>
                    <div className="tf-row">
                      {['true', 'false'].map((v) => (
                        <button key={v} disabled={submitted} className={'choice' + (a === v ? ' is-picked' : '')} onClick={() => setAnswers({ ...answers, [i]: v })}>
                          {v === 'true' ? t('True') : t('False')}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {q.type === 'choice' && (
                  <div className="choices">
                    {q.choices!.map((c) => (
                      <button
                        key={c}
                        disabled={submitted}
                        className={'choice' + (a === c ? ' is-picked' : '') + (submitted && c === q.item.face.answerText ? ' is-right' : '') + (submitted && a === c && c !== q.item.face.answerText ? ' is-wrong' : '')}
                        onClick={() => setAnswers({ ...answers, [i]: c })}
                      >
                        <span>{c}</span>
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'written' && (
                  <input className="input" disabled={submitted} value={a || ''} placeholder={t('Type your answer')} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} aria-label={t('Answer for question {n}', { n: i + 1 })} />
                )}
                {submitted && !right && (
                  <p className="test-correct">
                    {t('Correct answer')}: <b>{q.item.face.answerText}</b>
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        {!submitted && (
          <div className="test-submit">
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setSubmitted(true);
                const s = questions.filter((q, i) => isRight(q, answers[i])).length;
                addXp(s * 3, 'test');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              {t('Submit test')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Match ----------------
interface Tile {
  key: string;
  pair: string;
  side: 'q' | 'a';
  item: StudyItem;
}

export function MatchGame({ deckId }: { deckId: string | null }) {
  const t = useT();
  const info = useDeckInfo(deckId);
  useResumeRoute(deckId, 'match');
  const pool = useMemo(() => withAnswers(studyItems(getLib(), deckId)), [deckId]);
  const best = useStore((s) => s.lib.profile.matchBest[deckId || 'all']);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [start, setStart] = useState(0);
  const [penalty, setPenalty] = useState(0);
  const [end, setEnd] = useState(0);
  const [, tick] = useState(0);

  function newGame() {
    // one tile per distinct answer so pairs are never ambiguous
    const seen = new Set<string>();
    const chosen: StudyItem[] = [];
    for (const it of shuffle(pool)) {
      const k = it.face.answerText.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      chosen.push(it);
      if (chosen.length >= 6) break;
    }
    setTiles(shuffle(chosen.flatMap((it) => [{ key: it.card.id + 'q', pair: it.card.id, side: 'q' as const, item: it }, { key: it.card.id + 'a', pair: it.card.id, side: 'a' as const, item: it }])));
    setGone(new Set());
    setPicked(null);
    setStart(Date.now());
    setPenalty(0);
    setEnd(0);
  }
  useEffect(() => {
    if (pool.length >= 3) newGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);
  useEffect(() => {
    if (end || !start) return;
    const i = setInterval(() => tick((x) => x + 1), 100);
    return () => clearInterval(i);
  }, [end, start]);

  if (pool.length < 3) return <NeedAnswers deckId={deckId} />;

  function pick(tile: Tile) {
    if (gone.has(tile.key) || end) return;
    if (!picked) return setPicked(tile.key);
    if (picked === tile.key) return setPicked(null);
    const other = tiles.find((x) => x.key === picked)!;
    if (other.pair === tile.pair && other.side !== tile.side) {
      const g = new Set(gone);
      g.add(tile.key);
      g.add(other.key);
      setGone(g);
      setPicked(null);
      if (g.size === tiles.length) {
        const finish = Date.now();
        setEnd(finish);
        const time = finish - start + penalty;
        const key = deckId || 'all';
        const prev = getLib().profile.matchBest[key];
        if (!prev || time < prev) updateProfile({ matchBest: { ...getLib().profile.matchBest, [key]: time } });
        addXp(20, 'match');
      }
    } else {
      setWrong([tile.key, other.key]);
      setPenalty((p) => p + 1000);
      setPicked(null);
      setTimeout(() => setWrong([]), 450);
    }
  }

  const elapsed = (end || Date.now()) - start + penalty;
  const secs = (elapsed / 1000).toFixed(1);
  return (
    <div className="study-page">
      <StudyTop title={info.title} color={info.color} progress={tiles.length ? gone.size / tiles.length : 0} onClose={info.close}>
        <span className="study-count match-clock">
          <Timer size={14} /> {secs}s
        </span>
      </StudyTop>
      {end ? (
        <div className="study-done">
          <div className="done-art">
            <Trophy size={44} />
          </div>
          <h1>{t('{s} seconds', { s: secs })}</h1>
          <p className="muted">{best && elapsed <= best ? t('New best time!') : best ? t('Your best: {s} seconds', { s: (best / 1000).toFixed(1) }) : ''}</p>
          <div className="row-gap center">
            <Button variant="primary" icon={<RotateCcw size={16} />} onClick={newGame}>
              {t('Play again')}
            </Button>
            <Button onClick={info.close}>{t('Back to deck')}</Button>
          </div>
        </div>
      ) : (
        <div className="match-grid">
          {tiles.map((tile) => (
            <button
              key={tile.key}
              className={'match-tile' + (gone.has(tile.key) ? ' is-gone' : '') + (picked === tile.key ? ' is-picked' : '') + (wrong.includes(tile.key) ? ' is-wrong' : '') + (tile.side === 'a' ? ' is-answer' : '')}
              onClick={() => pick(tile)}
              disabled={gone.has(tile.key)}
            >
              {tile.side === 'q' ? <Prompt item={tile.item} compact /> : <span className="match-text">{tile.item.face.answerText}</span>}
            </button>
          ))}
        </div>
      )}
      {!end && <p className="muted small center">{t('Tap a question, then its answer. Wrong pairs add 1 second.')}</p>}
    </div>
  );
}

// ---------------- Gravity ----------------
interface Rock {
  id: number;
  item: StudyItem;
  x: number;
  y: number;
  speed: number;
}

export function GravityGame({ deckId }: { deckId: string | null }) {
  const t = useT();
  const info = useDeckInfo(deckId);
  useResumeRoute(deckId, 'gravity');
  const pool = useMemo(() => withAnswers(studyItems(getLib(), deckId)), [deckId]);
  const best = useStore((s) => s.lib.profile.gravityBest);
  const [state, setState] = useState<'ready' | 'play' | 'miss' | 'over'>('ready');
  const [rocks, setRocks] = useState<Rock[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [hits, setHits] = useState(0);
  const [missed, setMissed] = useState<StudyItem | null>(null);
  const [input, setInput] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const lastSpawn = useRef(0);
  const raf = useRef(0);
  const last = useRef(0);

  const rocksRef = useRef<Rock[]>([]);
  const livesRef = useRef(3);
  const levelRef = useRef(1);

  function spawn(): Rock {
    const item = pool[Math.floor(Math.random() * pool.length)];
    const lv = levelRef.current;
    // percent of the field height per millisecond: about 11 s to fall at level 1
    return { id: nextId.current++, item, x: 4 + Math.random() * 64, y: -16, speed: 0.0072 + lv * 0.0014 + Math.random() * 0.0018 };
  }

  function setRocksBoth(next: Rock[]) {
    rocksRef.current = next;
    setRocks(next);
  }

  function startGame() {
    setScore(0);
    setLives(3);
    livesRef.current = 3;
    setLevel(1);
    levelRef.current = 1;
    setHits(0);
    setRocksBoth([]);
    setState('play');
    lastSpawn.current = 0;
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  useEffect(() => {
    if (state !== 'play') return;
    last.current = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(64, now - last.current);
      last.current = now;
      let next = rocksRef.current.map((r) => ({ ...r, y: r.y + r.speed * dt }));
      const fell = next.find((r) => r.y >= 90);
      if (fell) {
        next = next.filter((r) => r.id !== fell.id);
        livesRef.current -= 1;
        setLives(livesRef.current);
        setMissed(fell.item);
        setRocksBoth(next);
        setState(livesRef.current <= 0 ? 'over' : 'miss');
        return;
      }
      lastSpawn.current += dt;
      const lv = levelRef.current;
      const gap = Math.max(1600, 4200 - lv * 320);
      if ((next.length === 0 || lastSpawn.current > gap) && next.length < 2 + Math.floor(lv / 2)) {
        next.push(spawn());
        lastSpawn.current = 0;
      }
      setRocksBoth(next);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (state === 'over') {
      if (score > getLib().profile.gravityBest) updateProfile({ gravityBest: score });
      if (score > 0) addXp(Math.round(score / 10), 'gravity');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (pool.length < 3) return <NeedAnswers deckId={deckId} />;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'miss' && missed) {
      if (gradeAnswer(input, missed.face.answerText) !== 'wrong') {
        setMissed(null);
        setInput('');
        setState('play');
        setTimeout(() => inputRef.current?.focus(), 30);
      } else setFlash('bad');
      return;
    }
    const hit = rocksRef.current
      .slice()
      .sort((a, b) => b.y - a.y)
      .find((r) => gradeAnswer(input, r.item.face.answerText) !== 'wrong');
    if (hit) {
      setRocksBoth(rocksRef.current.filter((r) => r.id !== hit.id));
      setScore((s) => s + 10 * levelRef.current);
      const h = hits + 1;
      setHits(h);
      if (h % 8 === 0) {
        levelRef.current += 1;
        setLevel(levelRef.current);
      }
      setFlash('good');
    } else setFlash('bad');
    setInput('');
    setTimeout(() => setFlash(null), 250);
  }

  return (
    <div className="study-page gravity-page">
      <StudyTop title={info.title} color={info.color} progress={Math.min(1, (hits % 8) / 8)} onClose={info.close}>
        <span className="study-count">
          <Zap size={14} /> {score}
        </span>
        <span className="study-count lives" aria-label={t('{n} lives left', { n: lives })}>
          {[0, 1, 2].map((k) => (
            <Heart key={k} size={14} fill={k < lives ? 'currentColor' : 'none'} />
          ))}
        </span>
      </StudyTop>
      <div className={'gravity-field' + (flash ? ' flash-' + flash : '')}>
        <span className="gravity-level">{t('Level {n}', { n: level })}</span>
        {rocks.map((r) => (
          <div key={r.id} className="rock" style={{ left: r.x + '%', top: r.y + '%' }}>
            <Prompt item={r.item} compact />
          </div>
        ))}
        <div className="gravity-ground" />
        {state === 'ready' && (
          <div className="gravity-overlay">
            <h1>{t('Gravity')}</h1>
            <p>{t('Cards fall from the sky. Type the answer and press Enter before they land. Three misses and the game ends.')}</p>
            {best > 0 && <p className="muted">{t('Your best: {n}', { n: best })}</p>}
            <Button variant="primary" size="lg" icon={<Play size={18} />} onClick={startGame}>
              {t('Start')}
            </Button>
          </div>
        )}
        {state === 'miss' && missed && (
          <div className="gravity-overlay">
            <h2>{t('Missed one')}</h2>
            <Prompt item={missed} compact />
            <p>
              {t('Answer')}: <b className="feedback-answer">{missed.face.answerText}</b>
            </p>
            <p className="muted">{t('Type the answer to keep going.')}</p>
          </div>
        )}
        {state === 'over' && (
          <div className="gravity-overlay">
            <h1>{t('Game over')}</h1>
            <p className="gravity-final">{score}</p>
            <p className="muted">{score >= best && score > 0 ? t('New high score!') : t('Your best: {n}', { n: best })}</p>
            <div className="row-gap center">
              <Button variant="primary" icon={<RotateCcw size={16} />} onClick={startGame}>
                {t('Play again')}
              </Button>
              <Button onClick={info.close}>{t('Back to deck')}</Button>
            </div>
          </div>
        )}
      </div>
      {(state === 'play' || state === 'miss') && (
        <form className="gravity-input" onSubmit={submit}>
          <input ref={inputRef} className="input input-lg" value={input} onChange={(e) => setInput(e.target.value)} placeholder={state === 'miss' ? t('Type the answer shown') : t('Type an answer, press Enter')} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label={t('Answer')} />
          <Button type="submit" variant="primary" size="lg">
            {t('Fire')}
          </Button>
        </form>
      )}
    </div>
  );
}

export { Progress };
