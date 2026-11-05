import { useState, type ReactNode } from 'react';
import { CalendarClock, CalendarDays, Repeat, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, relearnCards, resetCards, moveCardsTo } from '../lib/store';
import { useT, useLang } from '../lib/i18n';
import { dueInDays } from '../lib/srs';
import { formatDay } from '../lib/util';
import { DayPickerDialog } from './DayPicker';

type ItemC = (p: { icon?: ReactNode; children: ReactNode; onSelect?: () => void; hint?: ReactNode }) => ReactNode;
type SubC = (p: { icon?: ReactNode; label: ReactNode; children: ReactNode }) => ReactNode;
type SepC = () => ReactNode;
export type StudyAgainKind = 'relearn' | 'new' | 'date';

/**
 * "Study again" for cards you forgot: back into today's learning, start over as new,
 * or bring them back on a chosen day. Works in dropdown and right-click menus.
 */
export function useStudyAgain(onDone?: (kind: StudyAgainKind, ids: string[], dueAt?: number) => void) {
  const t = useT();
  const lang = useLang();
  const saved = useStore((s) => s.lib.settings.customDays);
  const days = [...new Set([1, ...(saved?.length ? saved : [2, 5, 10, 30])].filter((d) => d >= 1))].sort((a, b) => a - b);
  const [picking, setPicking] = useState<string[] | null>(null);

  const run = (kind: StudyAgainKind, ids: string[], dueAt?: number) => {
    if (!ids.length) return;
    const n = ids.length;
    if (kind === 'relearn') {
      relearnCards(ids);
      toast(n === 1 ? t('Added back to learning for today. You can study it now.') : t('{n} cards added back to learning for today.', { n }));
    } else if (kind === 'new') {
      resetCards(ids);
      toast(t('Progress reset. These cards are new again.'));
    } else if (dueAt) {
      moveCardsTo(ids, dueAt);
      toast(n === 1 ? t('This card comes back on {date}.', { date: formatDay(dueAt, lang) }) : t('{n} cards come back on {date}.', { n, date: formatDay(dueAt, lang) }));
    }
    onDone?.(kind, ids, dueAt);
  };

  const items = (ids: string[], I: ItemC, Sub: SubC, Sep: SepC) => (
    <Sub icon={<Repeat size={15} />} label={t('Study again')}>
      <I icon={<RotateCcw size={15} />} hint={t('Comes back in your review today')} onSelect={() => run('relearn', ids)}>
        {t('Learn again today')}
      </I>
      <I icon={<Sparkles size={15} />} hint={t('Clears its progress')} onSelect={() => run('new', ids)}>
        {t('Start over as new')}
      </I>
      <Sep />
      {days.map((d) => (
        <I key={d} icon={<CalendarClock size={15} />} hint={formatDay(dueInDays(d), lang)} onSelect={() => run('date', ids, dueInDays(d))}>
          {d === 1 ? t('Tomorrow') : t('In {n} days', { n: d })}
        </I>
      ))}
      <I icon={<CalendarDays size={15} />} onSelect={() => setPicking(ids)}>
        {t('Pick a day...')}
      </I>
    </Sub>
  );

  const dialog = (
    <DayPickerDialog
      open={!!picking}
      onOpenChange={(v) => !v && setPicking(null)}
      title={t('Study again on')}
      confirmLabel={t('Schedule')}
      onConfirm={(due) => {
        const ids = picking || [];
        setPicking(null);
        run('date', ids, due);
      }}
    />
  );
  return { items, dialog };
}
