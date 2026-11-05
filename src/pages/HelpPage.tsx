import { useT } from '../lib/i18n';
import { MonitorPlay } from 'lucide-react';
import { Button, Kbd } from '../components/ui';
import { navigate } from '../lib/router';
import { isDriveConfigured, isShareConfigured } from '../lib/drive';

export function HelpPage() {
  const t = useT();
  const keys: [string, string][] = [
    ['Ctrl K', t('Search cards, decks and actions')],
    ['P', t('Add photos')],
    ['N', t('New text card')],
    ['Space', t('Show answer, then rate Good')],
    ['1 2 3 4', t('Again, Hard, Good, Easy')],
    ['Ctrl Z', t('Undo the last rating')],
    ['E', t('Edit the current card while studying')],
    ['R', t('Read the card aloud')],
    ['-', t('Hide the card until tomorrow')],
    ['Ctrl Enter', t('Save the card you are writing')],
    ['Ctrl Shift C', t('Make a blank from selected words')],
    ['V R E L', t('Photo tools: select, box, oval, lasso')],
    ['B H A T X', t('Pen, highlighter, arrow, text, eraser')],
    ['Del', t('Delete the selected shape')],
  ];
  return (
    <div className="page help-page">
      <header className="page-head">
        <h1 className="page-title">{t('Help and shortcuts')}</h1>
        <span className="toolbar-flex" />
        <Button variant="primary" icon={<MonitorPlay size={16} />} onClick={() => navigate('/tutorial')}>
          {t('Watch the tutorial')}
        </Button>
      </header>
      <section className="panel">
        <h2 className="section-title">{t('How Flashcard Pro works')}</h2>
        <ol className="how-list">
          <li>{t('Add photos of notes, diagrams or textbook pages. Pick as many as you like.')}</li>
          <li>{t('For each photo, drag boxes over what you want to remember. Each hidden part becomes a card.')}</li>
          <li>{t('Study every day. Rate how well you knew each card and it comes back right before you would forget.')}</li>
          <li>{t('Sign in with Google to save everything in your own Drive and continue on any device.')}</li>
        </ol>
      </section>
      <section className="panel">
        <h2 className="section-title">{t('Card colors')}</h2>
        <ul className="legend legend-big">
          <li className="legend-new">
            <span className="legend-dot" />
            <b>{t('New')}</b> {t('not studied yet')}
          </li>
          <li className="legend-learning">
            <span className="legend-dot" />
            <b>{t('Learning')}</b> {t('seen recently, still settling in')}
          </li>
          <li className="legend-due">
            <span className="legend-dot" />
            <b>{t('Due')}</b> {t('ready to review today')}
          </li>
          <li className="legend-review">
            <span className="legend-dot" />
            <b>{t('Reviewing')}</b> {t('known, coming back in days')}
          </li>
          <li className="legend-mastered">
            <span className="legend-dot" />
            <b>{t('Mastered')}</b> {t('next review three weeks or more away')}
          </li>
        </ul>
        <p className="muted small">{t('Each deck also has its own color, shown as the band on top of its cards. You can add a red, orange, green, blue or purple label to any card.')}</p>
      </section>
      <section className="panel">
        <h2 className="section-title">{t('Keyboard shortcuts')}</h2>
        <table className="table keys">
          <tbody>
            {keys.map(([k, d]) => (
              <tr key={k}>
                <td>
                  {k.split(' ').map((x) => (
                    <Kbd key={x}>{x}</Kbd>
                  ))}
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel" id="setup">
        <h2 className="section-title">{t('Setting up Google Drive saving (for the site owner)')}</h2>
        <p>
          {t('Status')}: {isDriveConfigured() ? t('Google sign-in is on.') : t('Google sign-in is off.')} {isShareConfigured() ? t('Share links are on.') : t('Share links are off.')}
        </p>
        <ol className="how-list">
          <li>{t('Go to console.cloud.google.com, create a project, and turn on the Google Drive API.')}</li>
          <li>{t('Under Google Auth Platform, set up the consent screen (External) and add the drive.file scope.')}</li>
          <li>{t('Create an OAuth client ID of type Web application. Add your site address (for example https://yourname.github.io) under Authorized JavaScript origins.')}</li>
          <li>{t('For share links, create an API key, restrict it to the Google Drive API and to your site address.')}</li>
          <li>{t('Put both values in public/config.js in the repository and push. The site rebuilds by itself.')}</li>
        </ol>
      </section>
    </div>
  );
}
