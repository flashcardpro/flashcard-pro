import { useEffect, useState } from 'react';
import { Bell, CalendarPlus, Cloud, Download, LogIn, LogOut, Volume2, Palette, Brain, Timer, Upload, HardDrive, ShieldCheck, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, updateSettings } from '../lib/store';
import { useT } from '../lib/i18n';
import { listVoices, onVoicesChanged, speak, ttsSupported } from '../lib/speech';
import { askNotificationPermission, notificationsSupported, reminderIcs, notify } from '../lib/reminders';
import { buildBundle } from '../lib/bundle';
import { downloadBlob, dayKey, defaultSettings } from '../lib/util';
import { signOut, syncNow } from '../lib/sync';
import { navigate, useRoute } from '../lib/router';
import { isDriveConfigured } from '../lib/drive';
import { Button, Segmented, Select, Slider, Switch } from '../components/ui';
import type { ButtonTime, Rating, TimeUnit } from '../lib/types';
import { useSignIn } from '../components/SignIn';

const MASK_COLORS = ['#2B55E6', '#18213D', '#0E9F9A', '#7C4DDB', '#F08C00', '#E5484D'];

function Section({ icon, title, children, id }: { icon: React.ReactNode; title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="settings-section" id={id}>
      <h2 className="settings-title">
        {icon}
        {title}
      </h2>
      <div className="settings-body">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <b>{label}</b>
        {hint && <span className="muted small">{hint}</span>}
      </div>
      <div className="settings-control">{children}</div>
    </div>
  );
}

const MAX_AMOUNT: Record<TimeUnit, number> = { min: 1440, hour: 72, day: 365 };

/** A small number box that only saves whole numbers inside its range. */
function NumberBox({ value, min, max, onCommit, label }: { value: number; min: number; max: number; onCommit: (n: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  const commit = (raw: string) => {
    const n = Math.round(Number(raw));
    if (raw.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onCommit(n);
    else setText(String(value));
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      className="input input-sm num-box"
      min={min}
      max={max}
      value={text}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value);
        const n = Math.round(Number(e.target.value));
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onCommit(n);
      }}
      onBlur={(e) => commit(e.target.value)}
    />
  );
}

function ButtonTimes() {
  const t = useT();
  const times = useStore((st) => st.lib.settings.buttonTimes) || defaultSettings().buttonTimes;
  const names = [t('Again'), t('Hard'), t('Good'), t('Easy')];
  const units = [
    { value: 'min', label: t('minutes') },
    { value: 'hour', label: t('hours') },
    { value: 'day', label: t('days') },
  ];
  const set = (r: Rating, patch: Partial<ButtonTime>) => updateSettings({ buttonTimes: { ...times, [r]: { ...times[r], ...patch } } });
  const anyFixed = ([1, 2, 3, 4] as Rating[]).some((r) => times[r]?.mode === 'fixed');
  return (
    <>
      <ul className="btn-times">
        {([1, 2, 3, 4] as Rating[]).map((r) => {
          const bt = times[r] || defaultSettings().buttonTimes[r];
          return (
            <li key={r} className={'btn-time r' + r}>
              <span className="btn-time-name">{names[r - 1]}</span>
              <Select
                size="sm"
                value={bt.mode}
                onChange={(v) => set(r, { mode: v as ButtonTime['mode'] })}
                label={t('Time for {name}', { name: names[r - 1] })}
                options={[
                  { value: 'auto', label: t('Automatic'), hint: t('Gaps grow as you learn') },
                  { value: 'fixed', label: t('Fixed time'), hint: t('Always the same gap') },
                ]}
              />
              {bt.mode === 'fixed' ? (
                <span className="btn-time-fixed">
                  <NumberBox key={bt.unit + ':' + bt.amount} value={bt.amount} min={1} max={MAX_AMOUNT[bt.unit]} label={t('Amount')} onCommit={(n) => set(r, { amount: n })} />
                  <Select size="sm" value={bt.unit} onChange={(v) => set(r, { unit: v as TimeUnit, amount: Math.min(bt.amount, MAX_AMOUNT[v as TimeUnit]) })} options={units} label={t('Unit')} />
                </span>
              ) : (
                <span className="muted small">{t('The app works it out for each card')}</span>
              )}
            </li>
          );
        })}
      </ul>
      {anyFixed && (
        <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => updateSettings({ buttonTimes: defaultSettings().buttonTimes })}>
          {t('Set all back to automatic')}
        </Button>
      )}
    </>
  );
}

function CustomChoices() {
  const t = useT();
  const days = useStore((st) => st.lib.settings.customDays) || [2, 5, 10, 30];
  const list = [0, 1, 2, 3].map((i) => days[i] ?? [2, 5, 10, 30][i]);
  return (
    <div className="custom-choices">
      {list.map((d, i) => (
        <label key={i} className="custom-choice">
          <NumberBox
            key={d}
            value={d}
            min={1}
            max={365}
            label={t('Choice {n}', { n: i + 1 })}
            onCommit={(n) => {
              const next = list.slice();
              next[i] = n;
              updateSettings({ customDays: next });
            }}
          />
          <span className="muted small">{t('days')}</span>
        </label>
      ))}
    </div>
  );
}

export function SettingsPage() {
  const t = useT();
  const s = useStore((st) => st.lib.settings);
  const user = useStore((st) => st.user);
  const lastSynced = useStore((st) => st.lastSyncedAt);
  const signIn = useSignIn();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(listVoices());
  const [perm, setPerm] = useState(notificationsSupported() ? Notification.permission : 'denied');
  const route = useRoute();
  const section = route.query.get('section');
  useEffect(() => onVoicesChanged(() => setVoices(listVoices())), []);
  useEffect(() => {
    if (section !== 'buttons') return;
    const id = setTimeout(() => document.getElementById('rating-buttons')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    return () => clearTimeout(id);
  }, [section]);

  return (
    <div className="page settings-page">
      <header className="page-head">
        <h1 className="page-title">{t('Settings')}</h1>
      </header>

      <Section icon={<Cloud size={18} />} title={t('Account and saving')}>
        {user ? (
          <>
            <Row label={user.name} hint={user.email}>
              <Button variant="ghost" icon={<LogOut size={15} />} onClick={async () => (await signOut(), toast(t('Signed out. Your cards stay in your Google Drive.')))}>
                {t('Sign out')}
              </Button>
            </Row>
            <Row label={t('Google Drive')} hint={t('Your cards, photos and voice notes are saved in a "Flashcard Pro" folder in your Drive. The app can only see files it created.')}>
              <Button icon={<Cloud size={15} />} onClick={() => void syncNow()}>
                {t('Save now')}
              </Button>
            </Row>
            {lastSynced > 0 && <p className="muted small">{t('Last saved to Drive at {time}', { time: new Date(lastSynced).toLocaleTimeString() })}</p>}
          </>
        ) : (
          <Row label={t('Guest mode')} hint={isDriveConfigured() ? t('Sign in with Google to keep your cards safe in Drive and pick up where you left off on any device.') : t('Cards are saved in this browser. Google sign-in is not set up on this copy of the site.')}>
            <Button variant="primary" icon={<LogIn size={15} />} onClick={signIn.run}>
              {t('Sign in with Google')}
            </Button>
          </Row>
        )}
        <Row label={t('Backup file')} hint={t('Download every deck with photos and audio as one file. Open it from Import to restore.')}>
          <div className="row-gap">
            <Button
              icon={<Download size={15} />}
              onClick={async () => {
                const lib = useStore.getState().lib;
                const roots = Object.values(lib.decks).filter((d) => !d.parentId).map((d) => d.id);
                if (!roots.length) return toast(t('Nothing to back up yet.'));
                downloadBlob(await buildBundle(lib, roots), `flashcard-pro-backup-${dayKey()}.fcpro`);
              }}
            >
              {t('Download backup')}
            </Button>
            <Button variant="ghost" icon={<Upload size={15} />} onClick={() => navigate('/import')}>
              {t('Restore')}
            </Button>
          </div>
        </Row>
        <p className="privacy-note">
          <ShieldCheck size={15} /> {t('No Flashcard Pro server stores your data. Everything stays in your browser and, when signed in, your own Google Drive.')}
        </p>
      </Section>

      <Section icon={<Brain size={18} />} title={t('Studying')}>
        <Row label={t('Daily goal')} hint={t('Reviews per day. Reaching it earns bonus XP.')}>
          <Select value={String(s.dailyGoal)} onChange={(v) => updateSettings({ dailyGoal: Number(v) })} label={t('Daily goal')} options={[10, 20, 30, 50, 75, 100, 150, 200].map((n) => ({ value: String(n), label: t('{n} reviews', { n }) }))} />
        </Row>
        <Row label={t('How much to remember')} hint={t('Higher means more reviews but fewer forgotten cards. 90% suits most students.')}>
          <Select
            value={String(s.retention)}
            onChange={(v) => updateSettings({ retention: Number(v) })}
            label={t('How much to remember')}
            options={[
              { value: '0.8', label: t('80% (fewer reviews)') },
              { value: '0.85', label: '85%' },
              { value: '0.9', label: t('90% (recommended)') },
              { value: '0.95', label: t('95% (exam week)') },
            ]}
          />
        </Row>
      </Section>

      <Section icon={<SlidersHorizontal size={18} />} title={t('Rating buttons')} id="rating-buttons">
        <Row label={t('Button style')} hint={t('Four buttons like Anki, or a 1 to 5 confidence scale like Brainscape.')}>
          <Segmented
            value={s.ratingStyle}
            onChange={(v) => updateSettings({ ratingStyle: v })}
            label={t('Rating buttons')}
            options={[
              { value: 'four', label: t('Again / Hard / Good / Easy') },
              { value: 'confidence', label: t('Confidence 1 to 5') },
            ]}
          />
        </Row>
        <div className="settings-row btn-times-row">
          <div className="settings-label">
            <b>{t('When each button brings the card back')}</b>
            <span className="muted small">{t('Automatic suits most people: every time you remember a card, its gap grows. A fixed time always uses the gap you set, so cards do not spread out over time.')}</span>
            {s.ratingStyle === 'confidence' && <span className="muted small">{t('With 1 to 5 buttons: 1 is Again, 2 is Hard, 3 and 4 are Good, 5 is Easy.')}</span>}
          </div>
          <ButtonTimes />
        </div>
        <Row label={t('Show Custom button')} hint={t('A fifth button that lets you pick the day a card comes back.')}>
          <Switch checked={s.showCustomButton !== false} onChange={(v) => updateSettings({ showCustomButton: v })} label={t('Show Custom button')} />
        </Row>
        {s.showCustomButton !== false && (
          <Row label={t('Custom menu choices')} hint={t('The four quick choices in the Custom menu, in days.')}>
            <CustomChoices />
          </Row>
        )}
      </Section>

      <Section icon={<Palette size={18} />} title={t('Look and language')}>
        <Row label={t('Theme')}>
          <Segmented
            value={s.theme}
            onChange={(v) => updateSettings({ theme: v })}
            label={t('Theme')}
            options={[
              { value: 'light', label: t('Light') },
              { value: 'dark', label: t('Dark') },
              { value: 'system', label: t('Device') },
            ]}
          />
        </Row>
        <Row label={t('Language')}>
          <Select
            value={s.language}
            onChange={(v) => updateSettings({ language: v as 'en' | 'hi' })}
            label={t('Language')}
            options={[
              { value: 'en', label: 'English' },
              { value: 'hi', label: 'हिन्दी (Hindi)' },
            ]}
          />
        </Row>
        <Row label={t('Mask color')} hint={t('Color of the boxes that hide parts of photos.')}>
          <div className="swatch-row">
            {MASK_COLORS.map((c) => (
              <button key={c} className={'swatch-btn' + (s.maskColor === c ? ' is-on' : '')} style={{ background: c }} aria-label={c} onClick={() => updateSettings({ maskColor: c })} />
            ))}
          </div>
        </Row>
        <Row label={t('Question mask color')} hint={t('Color of the part you are being asked about.')}>
          <div className="swatch-row">
            {['#E5484D', '#F08C00', '#F2B705', '#7C4DDB', '#16A34A'].map((c) => (
              <button key={c} className={'swatch-btn' + (s.targetColor === c ? ' is-on' : '')} style={{ background: c }} aria-label={c} onClick={() => updateSettings({ targetColor: c })} />
            ))}
          </div>
        </Row>
      </Section>

      <Section icon={<Volume2 size={18} />} title={t('Read aloud')}>
        {!ttsSupported() ? (
          <p className="muted">{t('This browser cannot read text aloud.')}</p>
        ) : (
          <>
            <Row label={t('Read cards automatically')} hint={t('Reads the question when a card appears and the answer when you flip it.')}>
              <Switch checked={s.ttsAuto} onChange={(v) => updateSettings({ ttsAuto: v })} label={t('Read cards automatically')} />
            </Row>
            <Row label={t('English voice')} hint={t('Hindi text is read with a Hindi voice automatically when one is installed.')}>
              <Select
                value={s.ttsVoice || 'auto'}
                onChange={(v) => updateSettings({ ttsVoice: v === 'auto' ? '' : v })}
                label={t('Voice')}
                options={[{ value: 'auto', label: t('Best match') }, ...voices.filter((v) => /^(en|hi)/.test(v.lang)).map((v) => ({ value: v.voiceURI, label: v.name, hint: v.lang }))]}
              />
            </Row>
            <Row label={t('Speed')}>
              <div className="slider-row">
                <Slider value={s.ttsRate} min={0.6} max={1.6} step={0.1} onChange={(v) => updateSettings({ ttsRate: Math.round(v * 10) / 10 })} label={t('Speed')} />
                <b>{s.ttsRate.toFixed(1)}x</b>
                <Button size="sm" variant="ghost" onClick={() => speak(s.language === 'hi' ? 'नमस्ते, यह एक परीक्षण है।' : 'Photosynthesis turns light into food.')}>
                  {t('Test')}
                </Button>
              </div>
            </Row>
          </>
        )}
      </Section>

      <Section icon={<Timer size={18} />} title={t('Focus timer')}>
        <Row label={t('Focus length')}>
          <Select value={String(s.focusMinutes)} onChange={(v) => updateSettings({ focusMinutes: Number(v) })} label={t('Focus length')} options={[15, 20, 25, 30, 45, 50, 60].map((n) => ({ value: String(n), label: t('{n} min', { n }) }))} />
        </Row>
        <Row label={t('Break length')}>
          <Select value={String(s.breakMinutes)} onChange={(v) => updateSettings({ breakMinutes: Number(v) })} label={t('Break length')} options={[3, 5, 10, 15].map((n) => ({ value: String(n), label: t('{n} min', { n }) }))} />
        </Row>
      </Section>

      <Section icon={<Bell size={18} />} title={t('Daily reminder')}>
        <Row label={t('Remind me to study')} hint={t('A notification at this time when cards are due. It appears while Flashcard Pro is open in a browser tab.')}>
          <div className="row-gap">
            <input
              type="time"
              className="input input-sm"
              value={s.reminderTime}
              onChange={(e) => updateSettings({ reminderTime: e.target.value })}
              aria-label={t('Reminder time')}
            />
            <Switch
              checked={s.remindersOn}
              label={t('Remind me to study')}
              onChange={async (v) => {
                if (v) {
                  const p = await askNotificationPermission();
                  setPerm(p);
                  if (p !== 'granted') {
                    toast.error(t('Notifications are blocked. Allow them for this site in your browser settings.'));
                    return;
                  }
                  notify(t('Reminders are on'), t('We will remind you at {time}.', { time: s.reminderTime }));
                }
                updateSettings({ remindersOn: v });
              }}
            />
          </div>
        </Row>
        {perm === 'denied' && s.remindersOn && <p className="form-error">{t('Notifications are blocked. Allow them for this site in your browser settings.')}</p>}
        <Row label={t('Calendar reminder')} hint={t('Works even when the site is closed: adds a repeating daily event to Google Calendar, Outlook or your phone calendar.')}>
          <Button icon={<CalendarPlus size={15} />} onClick={() => downloadBlob(reminderIcs(s.reminderTime), 'flashcard-pro-reminder.ics')}>
            {t('Add to my calendar')}
          </Button>
        </Row>
      </Section>

      <Section icon={<HardDrive size={18} />} title={t('About')}>
        <p className="muted small">Flashcard Pro 1.0. {t('Spaced repetition by FSRS, the same scheduler used in modern Anki.')}</p>
        <div className="row-gap">
          <Button variant="ghost" onClick={() => navigate('/help')}>
            {t('Help and shortcuts')}
          </Button>
          <a className="btn btn-ghost btn-md" href="./privacy.html" target="_blank" rel="noopener">
            {t('Privacy policy')}
          </a>
          <a className="btn btn-ghost btn-md" href="./terms.html" target="_blank" rel="noopener">
            {t('Terms of use')}
          </a>
        </div>
      </Section>
      {signIn.dialogs}
    </div>
  );
}
