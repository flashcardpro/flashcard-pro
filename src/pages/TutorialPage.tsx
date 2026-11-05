import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Play, RotateCcw } from 'lucide-react';
import { useT } from '../lib/i18n';
import { navigate } from '../lib/router';
import { TUTORIALS, tutorialPoster, tutorialVideo, formatTime } from '../lib/tutorials';
import { Button, Progress } from '../components/ui';

const WATCHED_KEY = 'fcp-tutorial-watched';

function readWatched(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveWatched(ids: string[]) {
  try {
    localStorage.setItem(WATCHED_KEY, JSON.stringify(ids));
  } catch {
    /* private window: progress just is not remembered */
  }
}

export function TutorialPage({ lessonId }: { lessonId?: string }) {
  const t = useT();
  const start = Math.max(0, TUTORIALS.findIndex((x) => x.id === lessonId));
  const [index, setIndex] = useState(start);
  const [time, setTime] = useState(0);
  const [ended, setEnded] = useState(false);
  const [watched, setWatched] = useState<string[]>(readWatched);
  const video = useRef<HTMLVideoElement>(null);
  const autoplay = useRef(false);
  const lesson = TUTORIALS[index];
  const next = TUTORIALS[index + 1];

  useEffect(() => {
    if (autoplay.current) void video.current?.play().catch(() => {});
  }, [index]);

  const markWatched = () => {
    if (watched.includes(lesson.id)) return;
    const w = [...watched, lesson.id];
    setWatched(w);
    saveWatched(w);
  };

  const open = (i: number) => {
    autoplay.current = true;
    setTime(0);
    setEnded(false);
    setIndex(i);
    window.history.replaceState(null, '', '#/tutorial/' + TUTORIALS[i].id);
    if (window.innerWidth < 900) document.querySelector('.tut-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const seek = (at: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = at + 0.05;
    setEnded(false);
    void v.play().catch(() => {});
  };

  const active = lesson.steps.reduce((acc, s, i) => (time + 0.05 >= s.at ? i : acc), -1);

  return (
    <div className="page tutorial-page">
      <header className="page-head tut-head">
        <div>
          <h1 className="page-title">{t('Tutorial')}</h1>
          <p className="muted">{t('Short videos that show how to use Flashcard Pro. Watch them in order, or jump to the one you need.')}</p>
        </div>
        <div className="tut-progress">
          <span className="small">{t('{a} of {b} watched', { a: watched.filter((w) => TUTORIALS.some((x) => x.id === w)).length, b: TUTORIALS.length })}</span>
          <Progress value={watched.length / TUTORIALS.length} tone="green" label={t('Tutorial progress')} />
        </div>
      </header>

      <div className="tut-layout">
        <div className="tut-main">
          <section className={`tut-stage deck-${lesson.color}`} aria-label={t(lesson.title)}>
            <div className="tut-band" />
            <div className="tut-player">
              <video
                key={lesson.id}
                ref={video}
                src={tutorialVideo(lesson.id)}
                poster={tutorialPoster(lesson.id)}
                controls
                playsInline
                preload="metadata"
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  setTime(v.currentTime);
                  if (v.duration && v.currentTime / v.duration > 0.85) markWatched();
                }}
                onPlay={() => setEnded(false)}
                onEnded={() => {
                  markWatched();
                  setEnded(true);
                }}
              />
              {ended && (
                <div className="tut-ended">
                  <b>{next ? t('Up next: {title}', { title: t(next.title) }) : t('You have watched every lesson.')}</b>
                  <div className="row-gap">
                    <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={() => seek(0)}>
                      {t('Watch again')}
                    </Button>
                    {next ? (
                      <Button variant="primary" icon={<Play size={16} />} onClick={() => open(index + 1)}>
                        {t('Next lesson')}
                      </Button>
                    ) : (
                      <Button variant="primary" icon={<ArrowRight size={16} />} onClick={() => navigate('/')}>
                        {t('Start using Flashcard Pro')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="tut-now">
              <div className="tut-now-text">
                <span className="tut-kicker">{t('Lesson {n} of {m}', { n: index + 1, m: TUTORIALS.length })}</span>
                <h2>{t(lesson.title)}</h2>
                <p className="muted">{t(lesson.summary)}</p>
              </div>
              <Button icon={<ArrowRight size={16} />} onClick={() => navigate(lesson.action.to)}>
                {t(lesson.action.label)}
              </Button>
            </div>
          </section>

          {lesson.steps.length > 0 && (
            <section className="panel tut-steps-panel">
              <h2 className="section-title">{t('In this video')}</h2>
              <ol className="tut-steps">
                {lesson.steps.map((s, i) => (
                  <li key={i} className={i === active ? 'is-on' : i < active ? 'is-past' : ''}>
                    <button onClick={() => seek(s.at)}>
                      <span className="tut-time">{formatTime(s.at)}</span>
                      <span className="tut-step-text">{t(s.text)}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="muted small">{t('Click a step to jump to that part of the video.')}</p>
            </section>
          )}
        </div>

        <aside className="tut-side" aria-label={t('Lessons')}>
          <h2 className="section-title">{t('Lessons')}</h2>
          <ol className="tut-lessons">
            {TUTORIALS.map((x, i) => {
              const seen = watched.includes(x.id);
              return (
                <li key={x.id}>
                  <button className={`tut-lesson deck-${x.color}` + (i === index ? ' is-on' : '')} onClick={() => open(i)} aria-current={i === index ? 'true' : undefined}>
                    <span className="tut-lesson-thumb">
                      <img src={tutorialPoster(x.id)} alt="" loading="lazy" />
                      {x.duration > 0 && <span className="tut-dur">{formatTime(x.duration)}</span>}
                    </span>
                    <span className="tut-lesson-text">
                      <span className="tut-lesson-num">{t('Lesson {n}', { n: i + 1 })}</span>
                      <b>{t(x.title)}</b>
                    </span>
                    <span className={'tut-check' + (seen ? ' is-seen' : '')} aria-label={seen ? t('Watched') : t('Not watched yet')}>
                      {seen ? <Check size={14} /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
