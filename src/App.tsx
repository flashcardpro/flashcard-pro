import { useEffect, useState, lazy, Suspense } from 'react';
import { Toaster, toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useStore, saveResume } from './lib/store';
import { useRoute, match } from './lib/router';
import { useT, tNow } from './lib/i18n';
import { on } from './lib/events';
import { BADGES } from './lib/gamify';
import { bootstrap } from './lib/sync';
import { startReminderLoop } from './lib/reminders';
import { Shell, usePhotoPicker } from './components/Shell';
import { CommandPalette } from './components/CommandPalette';
import { TooltipProvider } from './components/ui';
import { HomePage } from './pages/HomePage';
import { DeckPage } from './pages/DeckPage';
import { NotePage } from './pages/NotePage';
import { AddPhotosPage } from './pages/AddPhotosPage';
import { StudyPage } from './pages/StudyPage';
import { CardBrowser } from './components/CardBrowser';
import { BadgeIcon } from './pages/AchievementsPage';
import { LogoMark } from './components/Logo';

const Practice = {
  learn: lazy(() => import('./pages/Practice').then((m) => ({ default: m.LearnMode }))),
  write: lazy(() => import('./pages/Practice').then((m) => ({ default: m.WriteMode }))),
  test: lazy(() => import('./pages/Practice').then((m) => ({ default: m.TestMode }))),
  match: lazy(() => import('./pages/Practice').then((m) => ({ default: m.MatchGame }))),
  gravity: lazy(() => import('./pages/Practice').then((m) => ({ default: m.GravityGame }))),
};
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })));
const AchievementsPage = lazy(() => import('./pages/AchievementsPage').then((m) => ({ default: m.AchievementsPage })));
const ImportPage = lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SharedDeckPage = lazy(() => import('./pages/SharedDeckPage').then((m) => ({ default: m.SharedDeckPage })));
const PrintPage = lazy(() => import('./pages/PrintPage').then((m) => ({ default: m.PrintPage })));
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })));

function useThemeAndLang() {
  const theme = useStore((s) => s.lib.settings.theme);
  const lang = useStore((s) => s.lib.settings.language);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E1424' : '#F4F7FC');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
  }, [lang]);
}

function useCelebrations() {
  useEffect(() => {
    const offs = [
      on('badge', ({ id }) => {
        const b = BADGES.find((x) => x.id === id);
        if (!b) return;
        toast(tNow('Badge earned: {name}', { name: tNow(b.title) }), {
          description: tNow(b.desc),
          icon: <span className="toast-badge"><BadgeIcon name={b.icon} size={18} /></span>,
          duration: 5000,
        });
      }),
      on('levelUp', ({ level }) => {
        toast(tNow('Level {n} reached', { n: level }), { icon: <span className="toast-level">{level}</span>, description: tNow('Keep going. Every review counts.'), duration: 5000 });
      }),
      on('toast', ({ kind, message }) => {
        if (message === 'goal') toast.success(tNow('Daily goal reached. +50 XP'));
        else toast[kind](message);
      }),
    ];
    return () => offs.forEach((f) => f());
  }, []);
}

function Loading() {
  return (
    <div className="center-page">
      <Loader2 size={28} className="spin" />
    </div>
  );
}

const NO_RESUME = ['/add-photos', '/shared', '/print', '/help', '/note/new'];

export default function App() {
  const ready = useStore((s) => s.ready);
  const route = useRoute();
  const t = useT();
  const [palette, setPalette] = useState(false);
  const picker = usePhotoPicker();
  useThemeAndLang();
  useCelebrations();

  useEffect(() => {
    bootstrap().then(() => startReminderLoop());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Remember the last place for "continue where you left off" (study pages save their own position).
  useEffect(() => {
    if (!ready) return;
    window.scrollTo({ top: 0 });
    const p = route.path;
    if (p.includes('/study/') || NO_RESUME.some((x) => p.startsWith(x))) return;
    if (p.startsWith('/deck/') || p.startsWith('/note/')) saveResume({ route: p, session: null });
  }, [route.path, ready]);

  if (!ready) {
    return (
      <div className="boot">
        <LogoMark size={56} />
      </div>
    );
  }

  const p = route.path;
  let page: React.ReactNode = null;
  let full = false;
  let m: Record<string, string> | null;

  if (p === '/' || p === '') page = <HomePage />;
  else if ((m = match('/deck/:id/study/:mode', p)) || (m = match('/study/:id/:mode', p))) {
    full = true;
    const deckId = m.id === 'all' ? null : m.id;
    const mode = m.mode;
    if (mode === 'review' || mode === 'cram') page = <StudyPage key={p} deckId={deckId} mode={mode} />;
    else {
      const C = Practice[mode as keyof typeof Practice];
      page = C ? <C deckId={deckId} /> : <StudyPage key={p} deckId={deckId} mode="review" />;
    }
  } else if ((m = match('/deck/:id', p))) page = <DeckPage key={m.id} id={m.id} addPhotosHint={route.query.get('add') === 'photos'} />;
  else if (p === '/note/new') page = <NotePage key={route.full} id={null} query={route.query} />;
  else if ((m = match('/note/:id', p))) page = <NotePage key={m.id} id={m.id} query={route.query} />;
  else if (p === '/add-photos') page = <AddPhotosPage />;
  else if (p === '/browse')
    page = (
      <div className="page">
        <header className="page-head">
          <h1 className="page-title">{t('All cards')}</h1>
        </header>
        <CardBrowser />
      </div>
    );
  else if (p === '/stats') page = <StatsPage />;
  else if (p === '/achievements') page = <AchievementsPage />;
  else if (p === '/import') page = <ImportPage />;
  else if (p === '/settings') page = <SettingsPage />;
  else if (p === '/help') page = <HelpPage />;
  else if ((m = match('/shared/:id', p))) page = <SharedDeckPage fileId={m.id} />;
  else if ((m = match('/print/:id', p))) {
    full = true;
    page = <PrintPage deckId={m.id} />;
  } else page = <HomePage />;

  return (
    <TooltipProvider>
      <Shell onSearch={() => setPalette(true)} fullBleed={full} noBottomNav={p.startsWith('/note') || p === '/add-photos'}>
        <Suspense fallback={<Loading />}>{page}</Suspense>
      </Shell>
      <CommandPalette open={palette} onOpenChange={setPalette} onAddPhotos={picker.open} />
      {picker.inputs}
      <Toaster position="bottom-center" offset={84} closeButton richColors={false} toastOptions={{ className: 'toast' }} />
    </TooltipProvider>
  );
}
