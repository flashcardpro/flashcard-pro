import { useMemo } from 'react';
import { Play, Flame, ImagePlus, CalendarClock, ArrowRight, Camera, FileText, Import, History, Target, Plus, MonitorPlay } from 'lucide-react';
import { useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { buildQueue, deckCounts, forecast, studyDays } from '../lib/srs';
import { levelInfo, streak, totalXp, todayReviews } from '../lib/gamify';
import { allExamPlans } from '../lib/planner';
import { navigate } from '../lib/router';
import { Button, Empty, Progress } from '../components/ui';
import { StatusBar, Heatmap, ForecastBars, Ring } from '../components/Charts';
import { deckTree, NewDeckButton } from '../components/DeckBits';
import { DeckContext, DeckKebab, usePhotoPicker } from '../components/Shell';
import type { Deck } from '../lib/types';

function DeckTile({ deck, depth }: { deck: Deck; depth: number }) {
  const t = useT();
  const lib = useStore((s) => s.lib);
  const c = useMemo(() => deckCounts(lib, deck.id), [lib, deck.id]);
  return (
    <DeckContext deck={deck}>
      <article className={`deck-tile deck-${deck.color}` + (depth ? ' is-sub' : '')} onClick={() => navigate('/deck/' + deck.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate('/deck/' + deck.id)}>
        <div className="deck-tile-band" />
        <div className="deck-tile-body">
          <div className="deck-tile-top">
            <h3 className="deck-tile-name">{deck.name}</h3>
            <DeckKebab deck={deck} />
          </div>
          <p className="deck-tile-meta">{c.total === 1 ? t('1 card') : t('{n} cards', { n: c.total })}</p>
          <StatusBar counts={c} />
          <div className="deck-tile-foot">
            {c.dueNow > 0 ? (
              <Button
                size="sm"
                variant="primary"
                icon={<Play size={14} />}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/deck/${deck.id}/study/review`);
                }}
              >
                {t('Study {n}', { n: c.dueNow })}
              </Button>
            ) : (
              <span className="deck-tile-done">{c.total ? t('All done for today') : t('Empty deck')}</span>
            )}
            {deck.examDate && (
              <span className="deck-tile-exam">
                <CalendarClock size={14} /> {deck.examDate}
              </span>
            )}
          </div>
        </div>
      </article>
    </DeckContext>
  );
}

export function HomePage() {
  const t = useT();
  const lib = useStore((s) => s.lib);
  const user = useStore((s) => s.user);
  const picker = usePhotoPicker();
  const due = useMemo(() => buildQueue(lib, null), [lib]);
  const tree = useMemo(() => deckTree(lib), [lib]);
  const xp = totalXp(lib);
  const lvl = levelInfo(xp);
  const st = streak(lib);
  const done = todayReviews(lib);
  const goal = lib.settings.dailyGoal;
  const plans = useMemo(() => allExamPlans(lib), [lib]);
  const days = useMemo(() => studyDays(lib), [lib]);
  const fc = useMemo(() => forecast(lib, null, 14), [lib]);
  const noteCount = Object.keys(lib.notes).length;
  const resume = lib.resume.route && lib.resume.route !== '/' && !lib.resume.route.startsWith('/shared') && !lib.resume.route.startsWith('/add-photos') ? lib.resume : null;
  const resumeDeck = resume ? lib.decks[/\/deck\/([^/?]+)/.exec(resume.route)?.[1] || ''] : null;

  // Which decks the due cards come from, for the stack's colored edges.
  const stackColors = useMemo(() => {
    const seen: string[] = [];
    for (const id of due) {
      const c = lib.cards[id];
      const d = c && lib.decks[c.deckId];
      if (d && !seen.includes(d.color)) seen.push(d.color);
      if (seen.length >= 4) break;
    }
    return seen.length ? seen : ['blue'];
  }, [due, lib]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('Good morning') : hour < 17 ? t('Good afternoon') : t('Good evening');
  const firstName = user?.name?.split(' ')[0];

  if (noteCount === 0) {
    return (
      <div className="page home is-empty">
        <section className="welcome">
          <div className="welcome-copy">
            <h1>{t('Turn any photo into a flashcard')}</h1>
            <p className="lead">{t('Snap your notes, a diagram or a textbook page. Hide the parts you want to remember, and Flashcard Pro shows each one back right before you would forget it.')}</p>
            <div className="row-gap">
              <Button size="lg" variant="primary" icon={<ImagePlus size={18} />} onClick={picker.open}>
                {t('Add photos')}
              </Button>
              <Button size="lg" icon={<Camera size={18} />} onClick={picker.camera} className="only-mobile-inline">
                {t('Take a photo')}
              </Button>
              <Button size="lg" variant="ghost" icon={<FileText size={18} />} onClick={() => navigate('/note/new')}>
                {t('Write a text card')}
              </Button>
              <Button size="lg" variant="ghost" icon={<Import size={18} />} onClick={() => navigate('/import')}>
                {t('Import from Anki or Quizlet')}
              </Button>
            </div>
            <p className="muted small">{t('Tip: you can also drag photos onto this page or paste a screenshot with Ctrl+V.')}</p>
            <a className="welcome-tutorial" href="#/tutorial">
              <MonitorPlay size={18} />
              <span>
                <b>{t('New here? Watch the tutorial')}</b>
                <span className="muted small">{t('Six short videos, about a minute each')}</span>
              </span>
              <ArrowRight size={16} />
            </a>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="demo-card demo-back" />
            <div className="demo-card demo-mid" />
            <div className="demo-card demo-front">
              <div className="demo-photo">
                <span className="demo-mask m1">?</span>
                <span className="demo-mask m2" />
                <span className="demo-mask m3" />
              </div>
              <div className="demo-lines">
                <span />
                <span />
              </div>
            </div>
          </div>
        </section>
        {picker.inputs}
      </div>
    );
  }

  return (
    <div className="page home">
      <section className="today">
        <div className="today-stack" style={{ ['--stack-a' as string]: `var(--deck-${stackColors[0]})`, ['--stack-b' as string]: `var(--deck-${stackColors[1] || stackColors[0]})`, ['--stack-c' as string]: `var(--deck-${stackColors[2] || stackColors[0]})` }}>
          <span className="stack-sheet s3" />
          <span className="stack-sheet s2" />
          <div className="stack-top">
            <p className="today-greet">
              {greeting}
              {firstName ? ', ' + firstName : ''}
            </p>
            {due.length > 0 ? (
              <>
                <p className="today-count">
                  <span className="today-num">{due.length}</span>
                  <span className="today-label">{due.length === 1 ? t('card is ready for you today') : t('cards are ready for you today')}</span>
                </p>
                <Button size="lg" variant="primary" icon={<Play size={18} />} onClick={() => navigate('/study/all/review')}>
                  {t('Start studying')}
                </Button>
              </>
            ) : (
              <>
                <p className="today-count">
                  <span className="today-label big">{t('You are all caught up.')}</span>
                </p>
                <p className="muted">{fc[1] ? t('{n} cards come back tomorrow. Add more photos or practice with a game.', { n: fc[1] }) : t('Add more photos, or practice with Match and Gravity from any deck.')}</p>
                <Button icon={<ImagePlus size={16} />} onClick={picker.open}>
                  {t('Add photos')}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="today-side">
          <div className="stat-card">
            <Ring value={goal ? done / goal : 0} size={68} tone="green">
              <Target size={20} />
            </Ring>
            <div>
              <b className="stat-big">
                {done}
                <span className="stat-of">/{goal}</span>
              </b>
              <span className="muted">{t('Daily goal')}</span>
            </div>
          </div>
          <div className={'stat-card' + (st.current ? ' is-hot' : '')}>
            <span className="flame">
              <Flame size={30} />
            </span>
            <div>
              <b className="stat-big">{st.current === 1 ? t('1 day') : t('{n} days', { n: st.current })}</b>
              <span className="muted">{st.studiedToday || !st.current ? t('Study streak') : t('Study today to keep your streak')}</span>
            </div>
          </div>
          <a className="stat-card level-card" href="#/achievements">
            <span className="level-badge">{lvl.level}</span>
            <div className="grow">
              <b>{t('Level {n}', { n: lvl.level })}</b>
              <Progress value={lvl.progress} tone="highlighter" label={t('Progress to next level')} />
              <span className="muted small">{t('{n} XP to the next level', { n: lvl.toNext })}</span>
            </div>
          </a>
        </div>
      </section>

      {resume && resumeDeck && (
        <a className="resume" href={'#' + resume.route}>
          <History size={18} />
          <span>
            {t('Continue where you left off')}: <b>{resumeDeck.name}</b>
            {resume.session && resume.route.includes('/study/') ? ` (${t('card {a} of {b}', { a: Math.min(resume.session.index + 1, resume.session.queue.length), b: resume.session.queue.length })})` : ''}
          </span>
          <ArrowRight size={16} />
        </a>
      )}

      {plans.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t('Exam countdown')}</h2>
          <div className="exam-list">
            {plans.map((p) => (
              <a key={p.deck.id} href={`#/deck/${p.deck.id}`} className={`exam-card status-${p.status} deck-${p.deck.color}`}>
                <span className="exam-days">
                  <b>{Math.max(0, p.daysLeft)}</b>
                  {p.daysLeft === 1 ? t('day left') : t('days left')}
                </span>
                <span className="exam-info">
                  <b>{p.deck.name}</b>
                  <span className="muted small">
                    {p.status === 'ahead'
                      ? t('Every card seen. Keep reviewing.')
                      : p.status === 'behind'
                        ? t('Behind: learn {n} new cards a day to finish in time', { n: p.neededPerDay })
                        : p.status === 'past'
                          ? t('Exam day has passed')
                          : t('On track: {n} new cards a day', { n: p.neededPerDay })}
                  </span>
                  <Progress value={p.readiness} tone={p.status === 'behind' ? 'red' : 'green'} label={t('Ready')} />
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">{t('Your decks')}</h2>
          <NewDeckButton variant="ghost" />
        </div>
        <div className="deck-grid">
          {tree.map(({ deck, depth }) => (
            <DeckTile key={deck.id} deck={deck} depth={depth} />
          ))}
          <button className="deck-tile deck-add" onClick={picker.open}>
            <Plus size={22} />
            <span>{t('Add photos to a new or existing deck')}</span>
          </button>
        </div>
      </section>

      <section className="section two-col">
        <div className="panel">
          <h2 className="section-title">{t('Study days')}</h2>
          <Heatmap days={days} />
          <p className="muted small">{t('Best streak: {n} days', { n: st.best })}</p>
        </div>
        <div className="panel">
          <h2 className="section-title">{t('Coming up')}</h2>
          <ForecastBars values={fc} />
          <p className="muted small">{t('Cards due each day for the next two weeks.')}</p>
        </div>
      </section>
      {picker.inputs}
      {due.length === 0 && Object.keys(lib.decks).length > 0 && <span className="sr-only">{t('Empty')}</span>}
    </div>
  );
}

export function EmptyDecks() {
  const t = useT();
  return <Empty title={t('No decks yet')}>{t('Add photos to get started.')}</Empty>;
}
