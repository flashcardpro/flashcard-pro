import { getLib } from './store';
import { buildQueue } from './srs';
import { dayKey } from './util';
import { tNow } from './i18n';
import { siteUrl } from './router';

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function askNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function notify(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: './logo-192.png', tag: 'flashcard-pro' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
}

let loop: ReturnType<typeof setInterval> | null = null;
const LAST_KEY = 'fcp-reminded-day';

function check() {
  const lib = getLib();
  const s = lib.settings;
  if (!s.remindersOn) return;
  const [hh, mm] = s.reminderTime.split(':').map(Number);
  const d = new Date();
  if (d.getHours() * 60 + d.getMinutes() < hh * 60 + mm) return;
  const today = dayKey();
  if (localStorage.getItem(LAST_KEY) === today) return;
  const due = buildQueue(lib, null).length;
  localStorage.setItem(LAST_KEY, today);
  if (due > 0) notify(tNow('Time to study'), tNow('{n} cards are waiting for you today.', { n: due }));
}

export function startReminderLoop() {
  if (loop) return;
  loop = setInterval(check, 60_000);
  setTimeout(check, 5000);
}

/** A repeating calendar event works even when the site is closed. */
export function reminderIcs(time: string): Blob {
  const [hh, mm] = time.split(':');
  const start = new Date();
  start.setHours(Number(hh), Number(mm), 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}T${pad(start.getHours())}${pad(start.getMinutes())}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const url = siteUrl('/');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flashcard Pro//Reminder//EN',
    'BEGIN:VEVENT',
    `UID:fcp-reminder-${Date.now()}@flashcard-pro`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${local}`,
    'DURATION:PT20M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${tNow('Study your flashcards')}`,
    `DESCRIPTION:${url}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${tNow('Study your flashcards')}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return new Blob([ics], { type: 'text/calendar' });
}
