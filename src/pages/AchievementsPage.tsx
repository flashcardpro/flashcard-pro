import { Award, Sparkles, Layers, Library, Zap, Flame, Crown, Camera, Images, EyeOff, Brackets, Mic, BadgeCheck, Brain, Moon, Sunrise, Timer, Rocket, Hourglass, Target, CalendarClock, Share2, Import } from 'lucide-react';

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = { Sparkles, Layers, Library, Zap, Flame, Crown, Camera, Images, EyeOff, Brackets, Mic, BadgeCheck, Brain, Moon, Sunrise, Timer, Rocket, Hourglass, Target, CalendarClock, Share2, Import };
import { useStore } from '../lib/store';
import { useT, useLang } from '../lib/i18n';
import { BADGES, levelInfo, totalXp, streak } from '../lib/gamify';
import { Progress, HoverCard } from '../components/ui';

export function BadgeIcon({ name, size = 22 }: { name: string; size?: number }) {
  const C = ICONS[name] || Award;
  return <C size={size} />;
}

export function AchievementsPage() {
  const t = useT();
  const lang = useLang();
  const lib = useStore((s) => s.lib);
  const xp = totalXp(lib);
  const lvl = levelInfo(xp);
  const st = streak(lib);
  const earned = BADGES.filter((b) => lib.profile.badges[b.id]).length;
  const fmt = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="page achievements">
      <header className="level-hero">
        <div className="level-hero-badge">
          <span>{lvl.level}</span>
        </div>
        <div className="grow">
          <h1>{t('Level {n}', { n: lvl.level })}</h1>
          <Progress value={lvl.progress} tone="highlighter" label={t('Progress to next level')} />
          <p className="muted">
            {t('{xp} XP in total. {n} XP to level {next}.', { xp, n: lvl.toNext, next: lvl.level + 1 })}
          </p>
        </div>
        <div className="level-hero-side">
          <b>{earned}</b>
          <span className="muted">{t('of {n} badges', { n: BADGES.length })}</span>
          <b>{st.best}</b>
          <span className="muted">{t('best streak')}</span>
        </div>
      </header>
      <section className="panel how-xp">
        <h2 className="section-title">{t('How to earn XP')}</h2>
        <ul>
          <li>{t('Review a card: 2 to 12 XP, more when you remember it')}</li>
          <li>{t('Hit your daily goal: 50 XP')}</li>
          <li>{t('Finish a focus session: 15 XP')}</li>
          <li>{t('Learn, Write and Test answers: 3 XP each')}</li>
          <li>{t('Finish Match: 20 XP. Gravity: score divided by 10')}</li>
        </ul>
      </section>
      <ul className="badge-grid">
        {BADGES.map((b) => {
          const at = lib.profile.badges[b.id];
          return (
            <li key={b.id}>
              <HoverCard
                trigger={
                  <div className={'badge' + (at ? ' is-earned' : '')} tabIndex={0}>
                    <span className="badge-icon">
                      <BadgeIcon name={b.icon} />
                    </span>
                    <b>{t(b.title)}</b>
                    <span className="badge-desc">{t(b.desc)}</span>
                  </div>
                }
              >
                <b>{t(b.title)}</b>
                <p>{t(b.desc)}</p>
                <p className="muted small">{at ? t('Earned on {d}', { d: fmt.format(new Date(at)) }) : t('Not earned yet')}</p>
              </HoverCard>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
