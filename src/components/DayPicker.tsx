import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useT, useLang } from '../lib/i18n';
import { dueInDays, dueOnDate } from '../lib/srs';
import { dayKey, formatDay, startOfStudyDay } from '../lib/util';
import { Button, Dialog } from './ui';

/** Asks for a day after today; the card comes back on the morning of that day. */
export function DayPickerDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  confirmLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (dueAt: number) => void;
  title?: string;
  confirmLabel?: string;
}) {
  const t = useT();
  const lang = useLang();
  const [day, setDay] = useState(() => dayKey(dueInDays(7)));
  const due = day ? dueOnDate(day) : 0;
  const days = due ? Math.round((due - startOfStudyDay()) / 86_400_000) : 0;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title || t('Choose a date')}
      description={t('The card comes back on the morning of this day.')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            variant="primary"
            icon={<CalendarClock size={16} />}
            disabled={days < 1}
            onClick={() => {
              onOpenChange(false);
              onConfirm(due);
            }}
          >
            {confirmLabel || t('Schedule card')}
          </Button>
        </>
      }
    >
      <input type="date" className="input" min={dayKey(dueInDays(1))} value={day} onChange={(e) => setDay(e.target.value)} aria-label={t('Choose a date')} />
      <p className="muted small custom-due-note">{days >= 1 ? t('{date}, in {n} days', { date: formatDay(due, lang), n: days }) : t('Pick a day after today.')}</p>
    </Dialog>
  );
}
