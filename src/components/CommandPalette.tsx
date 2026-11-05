import { Command } from 'cmdk';
import * as Dlg from '@radix-ui/react-dialog';
import { useMemo, useState } from 'react';
import { BarChart3, Brackets, FileText, FolderOpen, Home, ImagePlus, Import, Languages, Library, Moon, Play, Settings, Sun, Timer, Trophy, CircleHelp, Gamepad2, MonitorPlay } from 'lucide-react';
import { useStore, updateSettings } from '../lib/store';
import { useT } from '../lib/i18n';
import { navigate } from '../lib/router';
import { noteTitle } from '../lib/cards';
import { stripHtml } from '../lib/util';
import { useTimer } from '../lib/timer';
import { DeckSwatch } from './ui';
import { deckPath } from './DeckBits';

export function CommandPalette({ open, onOpenChange, onAddPhotos }: { open: boolean; onOpenChange: (v: boolean) => void; onAddPhotos: () => void }) {
  const t = useT();
  const lib = useStore((s) => s.lib);
  const [q, setQ] = useState('');
  const go = (fn: () => void) => {
    onOpenChange(false);
    setQ('');
    setTimeout(fn, 10);
  };
  const decks = Object.values(lib.decks).sort((a, b) => a.name.localeCompare(b.name));
  const noteHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const out = [];
    for (const n of Object.values(lib.notes)) {
      const hay = (stripHtml(n.front) + ' ' + stripHtml(n.back) + ' ' + n.tags.join(' ') + ' ' + (n.image?.masks.map((m) => m.label).join(' ') || '')).toLowerCase();
      if (hay.includes(needle)) out.push(n);
      if (out.length >= 8) break;
    }
    return out;
  }, [q, lib.notes]);

  return (
    <Dlg.Root open={open} onOpenChange={onOpenChange}>
      <Dlg.Portal>
        <Dlg.Overlay className="dialog-overlay" />
        <Dlg.Content className="cmdk-dialog" aria-label={t('Search')}>
          <Dlg.Title className="sr-only">{t('Search')}</Dlg.Title>
          <Dlg.Description className="sr-only">{t('Search cards, decks and actions')}</Dlg.Description>
          <Command label={t('Search')} shouldFilter={true} loop>
            <Command.Input className="cmdk-input" placeholder={t('Type a deck, a word from a card, or an action')} value={q} onValueChange={setQ} autoFocus />
            <Command.List className="cmdk-list">
              <Command.Empty className="cmdk-empty">{t('Nothing found. Try another word.')}</Command.Empty>
              {noteHits.length > 0 && (
                <Command.Group heading={t('Cards')}>
                  {noteHits.map((n) => (
                    <Command.Item key={n.id} value={'card ' + n.id + ' ' + q} onSelect={() => go(() => navigate('/note/' + n.id))} className="cmdk-item">
                      <FileText size={16} />
                      <span className="cmdk-main">{noteTitle(n) || t('Photo card')}</span>
                      <span className="cmdk-sub">{lib.decks[n.deckId]?.name}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading={t('Actions')}>
                <Command.Item className="cmdk-item" value="add photos images camera" onSelect={() => go(onAddPhotos)}>
                  <ImagePlus size={16} /> {t('Add photos')}
                </Command.Item>
                <Command.Item className="cmdk-item" value="new text card note" onSelect={() => go(() => navigate('/note/new'))}>
                  <FileText size={16} /> {t('New text card')}
                </Command.Item>
                <Command.Item className="cmdk-item" value="new cloze fill blank" onSelect={() => go(() => navigate('/note/new?type=cloze'))}>
                  <Brackets size={16} /> {t('New fill-in-the-blank card')}
                </Command.Item>
                <Command.Item className="cmdk-item" value="import anki quizlet csv" onSelect={() => go(() => navigate('/import'))}>
                  <Import size={16} /> {t('Import from Anki or Quizlet')}
                </Command.Item>
                <Command.Item className="cmdk-item" value="start focus timer pomodoro" onSelect={() => go(() => useTimer.getState().start())}>
                  <Timer size={16} /> {t('Start focus timer')}
                </Command.Item>
                <Command.Item
                  className="cmdk-item"
                  value="toggle dark light theme"
                  onSelect={() => go(() => updateSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }))}
                >
                  {document.documentElement.dataset.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} {t('Switch light or dark theme')}
                </Command.Item>
                <Command.Item className="cmdk-item" value="language hindi english" onSelect={() => go(() => updateSettings({ language: lib.settings.language === 'hi' ? 'en' : 'hi' }))}>
                  <Languages size={16} /> {lib.settings.language === 'hi' ? 'Switch to English' : 'हिन्दी में बदलें'}
                </Command.Item>
              </Command.Group>
              {decks.length > 0 && (
                <Command.Group heading={t('Study')}>
                  {decks.map((d) => (
                    <Command.Item key={'s' + d.id} className="cmdk-item" value={'study review ' + d.name} onSelect={() => go(() => navigate(`/deck/${d.id}/study/review`))}>
                      <Play size={16} /> {t('Study {name}', { name: d.name })}
                    </Command.Item>
                  ))}
                  {decks.map((d) => (
                    <Command.Item key={'g' + d.id} className="cmdk-item" value={'match game play ' + d.name} onSelect={() => go(() => navigate(`/deck/${d.id}/study/match`))}>
                      <Gamepad2 size={16} /> {t('Play Match with {name}', { name: d.name })}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {decks.length > 0 && (
                <Command.Group heading={t('Decks')}>
                  {decks.map((d) => (
                    <Command.Item key={d.id} className="cmdk-item" value={'open deck ' + deckPath(lib, d.id)} onSelect={() => go(() => navigate('/deck/' + d.id))}>
                      <DeckSwatch color={d.color} />
                      <span className="cmdk-main">{deckPath(lib, d.id)}</span>
                      <FolderOpen size={14} className="cmdk-trail" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading={t('Go to')}>
                {[
                  ['/', <Home size={16} key="i" />, t('Home')],
                  ['/browse', <Library size={16} key="i" />, t('All cards')],
                  ['/stats', <BarChart3 size={16} key="i" />, t('Progress')],
                  ['/achievements', <Trophy size={16} key="i" />, t('Badges')],
                  ['/settings', <Settings size={16} key="i" />, t('Settings')],
                  ['/tutorial', <MonitorPlay size={16} key="i" />, t('Tutorial videos')],
                  ['/help', <CircleHelp size={16} key="i" />, t('Help and shortcuts')],
                ].map(([to, icon, label]) => (
                  <Command.Item key={to as string} className="cmdk-item" value={'go ' + label} onSelect={() => go(() => navigate(to as string))}>
                    {icon} {label}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dlg.Content>
      </Dlg.Portal>
    </Dlg.Root>
  );
}
