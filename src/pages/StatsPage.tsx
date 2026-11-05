import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { deckCounts, deckDescendants, forecast, studyDays, statusOf, type DeckCounts } from '../lib/srs';
import { streak, totalXp, levelInfo } from '../lib/gamify';
import { noteTitle } from '../lib/cards';
import { StatusBar, Heatmap, ForecastBars } from '../components/Charts';
import { DeckSwatch, Select, Empty } from '../components/ui';
import { deckTree } from '../components/DeckBits';

export function StatsPage() {
  const t = useT();
  const lib = useStore((s) => s.lib);
  const [range, setRange] = useState('30');
  const [deckFilter, setDeckFilter] = useState('all');
  const days = useMemo(() => studyDays(lib), [lib]);
  const st = streak(lib);
  const xp = totalXp(lib);
  const lvl = levelInfo(xp);

  const stats = useMemo(() => {
    const since = Date.now() - Number(range) * 86_400_000;
    const deckOk = (id: string) => deckFilter === 'all' || id === deckFilter || (() => {
      let d = lib.decks[id];
      let guard = 0;
      while (d && guard++ < 20) {
        if (d.parentId === deckFilter) return true;
        d = d.parentId ? lib.decks[d.parentId] : (undefined as never);
      }
      return false;
    })();
    const reviews = Object.values(lib.reviews).filter((r) => r.ts >= since && deckOk(r.deckId));
    const matureReviews = reviews.filter((r) => r.prevState === 2);
    const retention = matureReviews.length ? matureReviews.filter((r) => r.rating > 1).length / matureReviews.length : null;
    const ms = reviews.reduce((a, r) => a + r.ms, 0);
    const counts: DeckCounts = { total: 0, new: 0, learning: 0, due: 0, review: 0, mastered: 0, suspended: 0, dueNow: 0 };
    for (const c of Object.values(lib.cards)) {
      if (!deckOk(c.deckId)) continue;
      counts.total++;
      counts[statusOf(c)]++;
    }
    const ratingDist = [1, 2, 3, 4].map((r) => reviews.filter((x) => x.rating === r).length);
    return { reviews: reviews.length, retention, minutes: Math.round(ms / 60000), counts, ratingDist };
  }, [lib, range, deckFilter]);

  const fc = useMemo(() => forecast(lib, deckFilter === 'all' ? null : deckDescendants(lib, deckFilter), 30), [lib, deckFilter]);
  const hardest = useMemo(
    () =>
      Object.values(lib.cards)
        .filter((c) => c.srs.lapses > 0 && lib.notes[c.noteId])
        .sort((a, b) => b.srs.lapses - a.srs.lapses)
        .slice(0, 8),
    [lib],
  );
  const tree = deckTree(lib);

  if (!Object.keys(lib.cards).length) return <Empty title={t('No progress yet')}>{t('Study a few cards and your progress shows up here.')}</Empty>;

  const ratingLabels = [t('Again'), t('Hard'), t('Good'), t('Easy')];
  const maxRating = Math.max(1, ...stats.ratingDist);

  return (
    <div className="page stats-page">
      <header className="page-head">
        <h1 className="page-title">{t('Progress')}</h1>
        <span className="toolbar-flex" />
        <Select
          size="sm"
          value={deckFilter}
          onChange={setDeckFilter}
          label={t('Deck')}
          options={[{ value: 'all', label: t('All decks') }, ...tree.map(({ deck, depth }) => ({ value: deck.id, label: <span className="deck-opt" style={{ paddingLeft: depth * 12 }}><DeckSwatch color={deck.color} />{deck.name}</span> }))]}
        />
        <Select
          size="sm"
          value={range}
          onChange={setRange}
          label={t('Time range')}
          options={[
            { value: '7', label: t('Last 7 days') },
            { value: '30', label: t('Last 30 days') },
            { value: '90', label: t('Last 3 months') },
            { value: '365', label: t('Last year') },
          ]}
        />
      </header>

      <div className="kpis">
        <div className="kpi">
          <b>{stats.reviews}</b>
          <span>{t('reviews')}</span>
        </div>
        <div className="kpi">
          <b>{stats.retention === null ? '-' : Math.round(stats.retention * 100) + '%'}</b>
          <span>{t('remembered (cards you already knew)')}</span>
        </div>
        <div className="kpi">
          <b>{stats.minutes}</b>
          <span>{t('minutes studied')}</span>
        </div>
        <div className="kpi">
          <b>{st.current}</b>
          <span>{t('day streak (best {n})', { n: st.best })}</span>
        </div>
        <div className="kpi">
          <b>{t('Level {n}', { n: lvl.level })}</b>
          <span>{xp} XP</span>
        </div>
      </div>

      <section className="panel">
        <h2 className="section-title">{t('Cards by stage')}</h2>
        <StatusBar counts={stats.counts} showLegend />
        <p className="muted small">{t('Mastered means the next review is three weeks or more away.')}</p>
      </section>

      <section className="two-col">
        <div className="panel">
          <h2 className="section-title">{t('Study days this year')}</h2>
          <Heatmap days={days} weeks={52} />
        </div>
        <div className="panel">
          <h2 className="section-title">{t('How you rated cards')}</h2>
          <div className="rating-bars">
            {stats.ratingDist.map((n, i) => (
              <div key={i} className={'rb rb-' + (i + 1)}>
                <span className="rb-label">{ratingLabels[i]}</span>
                <span className="rb-track">
                  <span style={{ width: `${(n / maxRating) * 100}%` }} />
                </span>
                <b>{n}</b>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">{t('Coming due in the next 30 days')}</h2>
        <ForecastBars values={fc} />
      </section>

      <section className="two-col">
        <div className="panel">
          <h2 className="section-title">{t('Decks')}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>{t('Deck')}</th>
                <th>{t('Cards')}</th>
                <th>{t('Due')}</th>
                <th>{t('Mastered')}</th>
              </tr>
            </thead>
            <tbody>
              {tree.map(({ deck, depth }) => {
                const c = deckCounts(lib, deck.id);
                return (
                  <tr key={deck.id}>
                    <td style={{ paddingLeft: 8 + depth * 14 }}>
                      <a href={'#/deck/' + deck.id} className="deck-opt">
                        <DeckSwatch color={deck.color} />
                        {deck.name}
                      </a>
                    </td>
                    <td>{c.total}</td>
                    <td>{c.dueNow}</td>
                    <td>{c.total ? Math.round((c.mastered / c.total) * 100) + '%' : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h2 className="section-title">{t('Cards you forget most')}</h2>
          {hardest.length === 0 ? (
            <p className="muted">{t('Nothing yet. Cards you forget often will show up here.')}</p>
          ) : (
            <ol className="hard-list">
              {hardest.map((c) => (
                <li key={c.id}>
                  <a href={'#/note/' + c.noteId}>{noteTitle(lib.notes[c.noteId]) || t('Photo card')}</a>
                  <span className="pill status-due">{t('forgotten {n} times', { n: c.srs.lapses })}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
