import { useEffect, useState } from 'react';
import { Bell, CalendarPlus, Cloud, Download, LogIn, LogOut, Volume2, Palette, Brain, Timer, Upload, HardDrive, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, updateSettings } from '../lib/store';
import { useT } from '../lib/i18n';
import { listVoices, onVoicesChanged, speak, ttsSupported } from '../lib/speech';
import { askNotificationPermission, notificationsSupported, reminderIcs, notify } from '../lib/reminders';
import { buildBundle } from '../lib/bundle';
import { downloadBlob, dayKey } from '../lib/util';
import { signOut, syncNow } from '../lib/sync';
import { navigate } from '../lib/router';
import { isDriveConfigured } from '../lib/drive';
import { Button, Segmented, Select, Slider, Switch } from '../components/ui';
import { useSignIn } from '../components/SignIn';

const MASK_COLORS = ['#2B55E6', '#18213D', '#0E9F9A', '#7C4DDB', '#F08C00', '#E5484D'];

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
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

export function SettingsPage() {
  const t = useT();
  const s = useStore((st) => st.lib.settings);
  const user = useStore((st) => st.user);
  const lastSynced = useStore((st) => st.lastSyncedAt);
  const signIn = useSignIn();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(listVoices());
  const [perm, setPerm] = useState(notificationsSupported() ? Notification.permission : 'denied');
  useEffect(() => onVoicesChanged(() => setVoices(listVoices())), []);

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
        <Row label={t('Rating buttons')} hint={t('Four buttons like Anki, or a 1 to 5 confidence scale like Brainscape.')}>
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
        <Button variant="ghost" onClick={() => navigate('/help')}>
          {t('Help and shortcuts')}
        </Button>
      </Section>
      {signIn.dialogs}
    </div>
  );
}
