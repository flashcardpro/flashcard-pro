import { create } from 'zustand';
import { addXp, getLib } from './store';
import { tNow } from './i18n';
import { notify } from './reminders';

export type TimerPhase = 'focus' | 'break';

interface TimerState {
  phase: TimerPhase;
  running: boolean;
  endsAt: number;
  remaining: number; // ms, when paused
  sessions: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
}

function durationFor(phase: TimerPhase) {
  const s = getLib().settings;
  return (phase === 'focus' ? s.focusMinutes : s.breakMinutes) * 60_000;
}

export const useTimer = create<TimerState>((set, get) => ({
  phase: 'focus',
  running: false,
  endsAt: 0,
  remaining: 25 * 60_000,
  sessions: 0,
  start() {
    const s = get();
    if (s.running) return;
    const rem = s.remaining > 0 ? s.remaining : durationFor(s.phase);
    set({ running: true, endsAt: Date.now() + rem });
  },
  pause() {
    const s = get();
    if (!s.running) return;
    set({ running: false, remaining: Math.max(0, s.endsAt - Date.now()) });
  },
  reset() {
    set({ running: false, phase: 'focus', remaining: durationFor('focus') });
  },
  skip() {
    finishPhase(false);
  },
}));

function chime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [660, 880, 990];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.4);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* audio blocked */
  }
}

function finishPhase(completed: boolean) {
  const s = useTimer.getState();
  const next: TimerPhase = s.phase === 'focus' ? 'break' : 'focus';
  if (completed) {
    chime();
    if (s.phase === 'focus') {
      addXp(15, 'focus');
      notify(tNow('Focus session done'), tNow('Take a {n} minute break.', { n: getLib().settings.breakMinutes }));
    } else {
      notify(tNow('Break is over'), tNow('Ready for the next focus session?'));
    }
  }
  useTimer.setState({
    phase: next,
    running: completed && next === 'break',
    endsAt: Date.now() + durationFor(next),
    remaining: durationFor(next),
    sessions: s.sessions + (completed && s.phase === 'focus' ? 1 : 0),
  });
}

setInterval(() => {
  const s = useTimer.getState();
  if (s.running && Date.now() >= s.endsAt) finishPhase(true);
}, 500);

export function formatClock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
