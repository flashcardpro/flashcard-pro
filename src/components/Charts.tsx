import type { DeckCounts } from '../lib/srs';
import { useT, useLang } from '../lib/i18n';
import { addDaysKey, dayKey } from '../lib/util';
import { Tooltip } from './ui';

const ORDER = ['new', 'learning', 'due', 'review', 'mastered'] as const;

export function StatusBar({ counts, showLegend = false }: { counts: DeckCounts; showLegend?: boolean }) {
  const t = useT();
  const total = ORDER.reduce((a, k) => a + counts[k], 0);
  const labels: Record<string, string> = { new: t('New'), learning: t('Learning'), due: t('Due'), review: t('Reviewing'), mastered: t('Mastered') };
  return (
    <div className="statusbar-wrap">
      <div className="statusbar" role="img" aria-label={ORDER.map((k) => `${labels[k]} ${counts[k]}`).join(', ')}>
        {total === 0 ? (
          <span className="statusbar-empty" />
        ) : (
          ORDER.map((k) => (counts[k] ? <span key={k} className={'seg-' + k} style={{ flexGrow: counts[k] }} /> : null))
        )}
      </div>
      {showLegend && (
        <ul className="legend">
          {ORDER.map((k) => (
            <li key={k} className={'legend-' + k}>
              <span className="legend-dot" />
              {labels[k]} <b>{counts[k]}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Heatmap({ days, weeks = 20 }: { days: Map<string, number>; weeks?: number }) {
  const t = useT();
  const lang = useLang();
  const today = dayKey();
  const todayDow = new Date(today + 'T12:00:00').getDay();
  const start = addDaysKey(today, -(weeks * 7 - 1) - (6 - todayDow));
  const cols: string[][] = [];
  for (let w = 0; w < weeks + 1; w++) {
    const col: string[] = [];
    for (let d = 0; d < 7; d++) col.push(addDaysKey(start, w * 7 + d));
    cols.push(col);
  }
  const max = Math.max(1, ...days.values());
  const level = (n: number) => (n === 0 ? 0 : n < max * 0.25 ? 1 : n < max * 0.5 ? 2 : n < max * 0.75 ? 3 : 4);
  const fmt = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
  return (
    <div className="heatmap" role="img" aria-label={t('Study days over the last {n} weeks', { n: weeks })}>
      {cols.map((col, i) => (
        <div className="heat-col" key={i}>
          {col.map((k) => {
            if (k > today) return <span key={k} className="heat-cell is-future" />;
            const n = days.get(k) || 0;
            return (
              <Tooltip key={k} text={`${fmt.format(new Date(k + 'T12:00:00'))}: ${n === 1 ? t('1 review') : t('{n} reviews', { n })}`}>
                <span className={`heat-cell l${level(n)}` + (k === today ? ' is-today' : '')} />
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function ForecastBars({ values }: { values: number[] }) {
  const t = useT();
  const lang = useLang();
  const max = Math.max(1, ...values);
  const fmt = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'narrow' });
  return (
    <div className="forecast" role="img" aria-label={t('Cards coming due over the next {n} days', { n: values.length })}>
      {values.map((v, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return (
          <Tooltip key={i} text={(i === 0 ? t('Today') : i === 1 ? t('Tomorrow') : d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'short' })) + ': ' + v}>
            <div className="fc-col">
              <span className="fc-num">{v || ''}</span>
              <span className={'fc-bar' + (i === 0 ? ' is-today' : '')} style={{ height: `${(v / max) * 100}%` }} />
              <span className="fc-day">{i === 0 ? t('Today').slice(0, 1) : fmt.format(d)}</span>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 7, children, tone = 'ballpoint' }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; tone?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={'ring tone-' + tone} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-value"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  );
}
