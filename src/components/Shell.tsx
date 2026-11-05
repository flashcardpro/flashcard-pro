import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Home,
  Library,
  BarChart3,
  Trophy,
  Import,
  Settings,
  Search,
  ImagePlus,
  ChevronDown,
  Camera,
  FileText,
  Brackets,
  FolderPlus,
  Timer,
  Sun,
  Moon,
  Monitor,
  Languages,
  LogOut,
  LogIn,
  RefreshCw,
  Cloud,
  CloudOff,
  Menu as MenuIcon,
  Plus,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  MoreHorizontal,
  Pencil,
  Trash2,
  Share2,
  Printer,
  Download,
  Palette,
  CircleHelp,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useStore, updateSettings, deleteDeck, updateDeck } from '../lib/store';
import { useT } from '../lib/i18n';
import { navigate, useRoute } from '../lib/router';
import { Logo } from './Logo';
import {
  Button,
  IconButton,
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSep,
  MenuLabel,
  MenuRadioGroup,
  MenuRadio,
  MenuSub,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Tooltip,
  Sheet,
  Kbd,
  Ctx,
  CtxTrigger,
  CtxContent,
  CtxItem,
  CtxSub,
  CtxSep,
  DeckSwatch,
  Select,
  Dialog,
} from './ui';
import { deckTree, DeckFormDialog, colorName } from './DeckBits';
import { addPhotos } from '../lib/photoQueue';
import { buildQueue } from '../lib/srs';
import { useTimer, formatClock } from '../lib/timer';
import { reconnect, signOut, syncNow } from '../lib/sync';
import { DECK_COLORS, type Deck } from '../lib/types';
import { toast } from 'sonner';
import { buildBundle } from '../lib/bundle';
import { downloadBlob, safeFileName } from '../lib/util';
import { ShareDialog } from './ShareDialog';
import { useSignIn } from './SignIn';

export function usePhotoPicker() {
  const ref = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const inputs = (
    <>
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => (e.target.files && addPhotos(e.target.files), (e.target.value = ''))} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (e.target.files && addPhotos(e.target.files), (e.target.value = ''))} />
    </>
  );
  return { open: () => ref.current?.click(), camera: () => camRef.current?.click(), inputs };
}

function SyncChip() {
  const t = useT();
  const user = useStore((s) => s.user);
  const status = useStore((s) => s.syncStatus);
  const err = useStore((s) => s.syncError);
  if (!user) return null;
  const map: Record<string, { icon: ReactNode; text: string; cls: string }> = {
    idle: { icon: <Cloud size={14} />, text: t('Drive'), cls: '' },
    syncing: { icon: <RefreshCw size={14} className="spin" />, text: t('Saving'), cls: '' },
    synced: { icon: <Check size={14} />, text: t('Saved to Drive'), cls: 'is-ok' },
    paused: { icon: <CloudOff size={14} />, text: t('Reconnect Drive'), cls: 'is-warn' },
    error: { icon: <AlertTriangle size={14} />, text: t('Sync problem'), cls: 'is-bad' },
    offline: { icon: <CloudOff size={14} />, text: t('Offline'), cls: 'is-warn' },
    local: { icon: <CloudOff size={14} />, text: t('This browser only'), cls: '' },
  };
  const m = map[status] || map.idle;
  const click = async () => {
    if (status === 'paused') {
      try {
        await reconnect();
        toast.success(t('Drive reconnected.'));
      } catch (e) {
        if ((e as Error).message !== 'popup-closed') toast.error((e as Error).message);
      }
    } else void syncNow();
  };
  return (
    <Tooltip text={status === 'error' ? err : status === 'paused' ? t('Google sign-in expired. Your changes are safe here; click to keep saving to Drive.') : t('Save now')}>
      <button className={'sync-chip ' + m.cls} onClick={click}>
        {m.icon}
        <span>{m.text}</span>
      </button>
    </Tooltip>
  );
}

function AccountMenu({ onSignIn }: { onSignIn: () => void }) {
  const t = useT();
  const user = useStore((s) => s.user);
  if (!user) {
    return (
      <Button size="sm" variant="secondary" icon={<LogIn size={15} />} onClick={onSignIn} className="signin-btn">
        {t('Sign in')}
      </Button>
    );
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="avatar-btn" aria-label={t('Account')}>
          {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span>{user.name.slice(0, 1)}</span>}
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>
          <span className="menu-account">
            <b>{user.name}</b>
            <span>{user.email}</span>
          </span>
        </MenuLabel>
        <MenuSep />
        <MenuItem icon={<RefreshCw size={15} />} onSelect={() => void syncNow()}>
          {t('Save to Drive now')}
        </MenuItem>
        <MenuItem
          icon={<Cloud size={15} />}
          onSelect={async () => {
            try {
              await reconnect();
            } catch {
              /* closed */
            }
          }}
        >
          {t('Reconnect Google Drive')}
        </MenuItem>
        <MenuItem icon={<Settings size={15} />} onSelect={() => navigate('/settings')}>
          {t('Settings')}
        </MenuItem>
        <MenuSep />
        <MenuItem
          icon={<LogOut size={15} />}
          onSelect={async () => {
            await signOut();
            navigate('/');
            toast(t('Signed out. Your cards stay in your Google Drive.'));
          }}
        >
          {t('Sign out')}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

// ---------- focus timer ----------
function FocusTimerButton() {
  const t = useT();
  const s = useTimer();
  const [, force] = useState(0);
  useEffect(() => {
    if (!s.running) return;
    const i = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, [s.running]);
  const left = s.running ? s.endsAt - Date.now() : s.remaining;
  const settings = useStore((st) => st.lib.settings);
  return (
    <Popover>
      <Tooltip text={t('Focus timer')}>
        <PopoverTrigger asChild>
          <button className={'timer-btn' + (s.running ? ' is-running' : '') + (s.phase === 'break' ? ' is-break' : '')} aria-label={t('Focus timer')}>
            <Timer size={17} />
            {(s.running || s.remaining < settings.focusMinutes * 60_000) && <span className="timer-clock">{formatClock(left)}</span>}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent className="timer-pop" align="end">
        <div className="timer-face">
          <span className="timer-phase">{s.phase === 'focus' ? t('Focus') : t('Break')}</span>
          <span className="timer-big">{formatClock(left)}</span>
          <span className="muted">{t('{n} sessions today', { n: s.sessions })}</span>
        </div>
        <div className="timer-actions">
          {s.running ? (
            <Button icon={<Pause size={15} />} onClick={s.pause}>
              {t('Pause')}
            </Button>
          ) : (
            <Button variant="primary" icon={<Play size={15} />} onClick={s.start}>
              {t('Start')}
            </Button>
          )}
          <IconButton label={t('Reset')} onClick={s.reset}>
            <RotateCcw size={16} />
          </IconButton>
          <IconButton label={t('Skip to next')} onClick={s.skip}>
            <SkipForward size={16} />
          </IconButton>
        </div>
        <div className="timer-settings">
          <label>
            {t('Focus')}
            <Select
              size="sm"
              value={String(settings.focusMinutes)}
              onChange={(v) => {
                updateSettings({ focusMinutes: Number(v) });
                if (!s.running && s.phase === 'focus') useTimer.setState({ remaining: Number(v) * 60_000 });
              }}
              options={[15, 20, 25, 30, 45, 50, 60].map((n) => ({ value: String(n), label: t('{n} min', { n }) }))}
              label={t('Focus length')}
            />
          </label>
          <label>
            {t('Break')}
            <Select
              size="sm"
              value={String(settings.breakMinutes)}
              onChange={(v) => updateSettings({ breakMinutes: Number(v) })}
              options={[3, 5, 10, 15].map((n) => ({ value: String(n), label: t('{n} min', { n }) }))}
              label={t('Break length')}
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- deck context menu (shared by sidebar and deck tiles) ----------
export function useDeckActions(deck: Deck) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [sub, setSub] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const exportDeck = async () => {
    const blob = await buildBundle(useStore.getState().lib, [deck.id]);
    downloadBlob(blob, `${safeFileName(deck.name)}.fcpro`);
  };
  const items = (I: typeof CtxItem, Sub: typeof CtxSub, Sep: typeof CtxSep) => (
    <>
      <I icon={<Play size={15} />} onSelect={() => navigate(`/deck/${deck.id}/study/review`)}>
        {t('Study now')}
      </I>
      <I icon={<ImagePlus size={15} />} onSelect={() => navigate(`/deck/${deck.id}?add=photos`)}>
        {t('Add photos')}
      </I>
      <I icon={<FileText size={15} />} onSelect={() => navigate(`/note/new?deck=${deck.id}`)}>
        {t('New card')}
      </I>
      <Sep />
      <I icon={<Pencil size={15} />} onSelect={() => setEditing(true)}>
        {t('Rename or move')}
      </I>
      <Sub icon={<Palette size={15} />} label={t('Color')}>
        {DECK_COLORS.map((c) => (
          <I key={c} icon={<DeckSwatch color={c} />} onSelect={() => updateDeck(deck.id, { color: c })}>
            {t(colorName(c))}
            {deck.color === c && <Check size={14} className="menu-trailing" />}
          </I>
        ))}
      </Sub>
      <I icon={<FolderPlus size={15} />} onSelect={() => setSub(true)}>
        {t('Add a deck inside')}
      </I>
      <Sep />
      <I icon={<Share2 size={15} />} onSelect={() => setSharing(true)}>
        {t('Share by link')}
      </I>
      <I icon={<Download size={15} />} onSelect={exportDeck}>
        {t('Download deck file')}
      </I>
      <I icon={<Printer size={15} />} onSelect={() => navigate(`/print/${deck.id}`)}>
        {t('Print or save as PDF')}
      </I>
      <Sep />
      <I icon={<Trash2 size={15} />} danger onSelect={() => setConfirmDel(true)}>
        {t('Delete deck')}
      </I>
    </>
  );
  const dialogs = (
    <>
      <DeckFormDialog open={editing} onOpenChange={setEditing} deck={deck} />
      <DeckFormDialog open={sub} onOpenChange={setSub} parentId={deck.id} />
      <ShareDialog open={sharing} onOpenChange={setSharing} deckId={deck.id} />
      <Dialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title={t('Delete "{name}"?', { name: deck.name })}
        description={t('This deletes the deck, the decks inside it, and all their cards and study history.')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteDeck(deck.id);
                setConfirmDel(false);
                if (window.location.hash.includes(deck.id)) navigate('/');
                toast(t('Deck deleted.'));
              }}
            >
              {t('Delete deck')}
            </Button>
          </>
        }
      />
    </>
  );
  return { items, dialogs };
}

// Dropdown flavours of the same deck actions for kebab buttons.
const DMItem = MenuItem as unknown as typeof CtxItem;
const DMSub = MenuSub as unknown as typeof CtxSub;
const DMSep = MenuSep as unknown as typeof CtxSep;

export function DeckKebab({ deck }: { deck: Deck }) {
  const t = useT();
  const { items, dialogs } = useDeckActions(deck);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button className="icon-btn" aria-label={t('Deck actions')} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal size={18} />
          </button>
        </MenuTrigger>
        <MenuContent>{items(DMItem, DMSub, DMSep)}</MenuContent>
      </Menu>
      {dialogs}
    </>
  );
}

export function DeckContext({ deck, children }: { deck: Deck; children: ReactNode }) {
  const { items, dialogs } = useDeckActions(deck);
  return (
    <>
      <Ctx>
        <CtxTrigger asChild>{children}</CtxTrigger>
        <CtxContent>{items(CtxItem, CtxSub, CtxSep)}</CtxContent>
      </Ctx>
      {dialogs}
    </>
  );
}

// ---------- sidebar ----------
function SidebarDeck({ deck, depth, due, active }: { deck: Deck; depth: number; due: number; active: boolean }) {
  return (
    <DeckContext deck={deck}>
      <a href={`#/deck/${deck.id}`} className={'side-deck' + (active ? ' is-active' : '')} style={{ paddingLeft: 10 + depth * 14 }}>
        <span className={`side-deck-band deck-${deck.color}`} />
        <span className="side-deck-name">{deck.name}</span>
        {due > 0 && <span className="side-deck-due">{due}</span>}
      </a>
    </DeckContext>
  );
}

function Sidebar({ onSignIn, onNavigate }: { onSignIn: () => void; onNavigate?: () => void }) {
  const t = useT();
  const lib = useStore((s) => s.lib);
  const route = useRoute();
  const user = useStore((s) => s.user);
  const [newDeck, setNewDeck] = useState(false);
  const tree = useMemo(() => deckTree(lib), [lib.decks]); // eslint-disable-line react-hooks/exhaustive-deps
  const dueByDeck = useMemo(() => {
    const m = new Map<string, number>();
    for (const { deck } of tree) m.set(deck.id, buildQueue(lib, deck.id).length);
    return m;
  }, [lib, tree]);
  const nav = [
    { to: '/', icon: <Home size={18} />, label: t('Home') },
    { to: '/browse', icon: <Library size={18} />, label: t('All cards') },
    { to: '/stats', icon: <BarChart3 size={18} />, label: t('Progress') },
    { to: '/achievements', icon: <Trophy size={18} />, label: t('Badges') },
    { to: '/import', icon: <Import size={18} />, label: t('Import') },
    { to: '/settings', icon: <Settings size={18} />, label: t('Settings') },
  ];
  return (
    <nav className="sidebar" aria-label={t('Main')} onClick={(e) => (e.target as HTMLElement).closest('a') && onNavigate?.()}>
      <a href="#/" className="side-logo" aria-label="Flashcard Pro">
        <Logo />
      </a>
      <ul className="side-nav">
        {nav.map((n) => (
          <li key={n.to}>
            <a href={'#' + n.to} className={'side-link' + (route.path === n.to ? ' is-active' : '')}>
              {n.icon}
              <span>{n.label}</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="side-section">
        <div className="side-section-head">
          <span>{t('Decks')}</span>
          <IconButton label={t('New deck')} onClick={() => setNewDeck(true)} className="icon-btn-sm">
            <Plus size={16} />
          </IconButton>
        </div>
        <div className="side-decks">
          {tree.length === 0 && <p className="side-empty">{t('No decks yet. Add photos or create a deck to start.')}</p>}
          {tree.map(({ deck, depth }) => (
            <SidebarDeck key={deck.id} deck={deck} depth={depth} due={dueByDeck.get(deck.id) || 0} active={route.path.startsWith('/deck/' + deck.id)} />
          ))}
        </div>
      </div>
      <div className="side-foot">
        {user ? (
          <div className="side-user">
            {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="side-user-initial">{user.name.slice(0, 1)}</span>}
            <span className="side-user-name">
              <b>{user.name}</b>
              <SyncChip />
            </span>
          </div>
        ) : (
          <div className="side-guest">
            <p>{t('You are studying as a guest. Cards are saved in this browser only.')}</p>
            <Button size="sm" variant="primary" icon={<LogIn size={15} />} onClick={onSignIn}>
              {t('Save to Google Drive')}
            </Button>
          </div>
        )}
      </div>
      <DeckFormDialog open={newDeck} onOpenChange={setNewDeck} />
    </nav>
  );
}

// ---------- top bar ----------
function AddMenu({ picker }: { picker: ReturnType<typeof usePhotoPicker> }) {
  const t = useT();
  const [newDeck, setNewDeck] = useState(false);
  const deckParam = () => {
    const m = /^#\/deck\/([^/?]+)/.exec(window.location.hash);
    return m ? '&deck=' + m[1] : '';
  };
  return (
    <div className="split-btn">
      <Button variant="primary" icon={<ImagePlus size={17} />} onClick={picker.open} className="split-main">
        <span className="hide-sm">{t('Add photos')}</span>
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <button className="btn btn-primary split-caret" aria-label={t('More ways to add')}>
            <ChevronDown size={16} />
          </button>
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>{t('Add to your cards')}</MenuLabel>
          <MenuItem icon={<ImagePlus size={15} />} onSelect={picker.open} shortcut="P" hint={t('Pick as many as you like')}>
            {t('Add photos')}
          </MenuItem>
          <MenuItem icon={<Camera size={15} />} onSelect={picker.camera} hint={t('Phone or tablet camera')}>
            {t('Take a photo')}
          </MenuItem>
          <MenuSep />
          <MenuItem icon={<FileText size={15} />} onSelect={() => navigate('/note/new?type=basic' + deckParam())} shortcut="N">
            {t('Text card')}
          </MenuItem>
          <MenuItem icon={<Brackets size={15} />} onSelect={() => navigate('/note/new?type=cloze' + deckParam())}>
            {t('Fill-in-the-blank card')}
          </MenuItem>
          <MenuSep />
          <MenuItem icon={<FolderPlus size={15} />} onSelect={() => setNewDeck(true)}>
            {t('New deck')}
          </MenuItem>
          <MenuItem icon={<Import size={15} />} onSelect={() => navigate('/import')}>
            {t('Import from Anki or Quizlet')}
          </MenuItem>
        </MenuContent>
      </Menu>
      <DeckFormDialog open={newDeck} onOpenChange={setNewDeck} onSaved={(d) => navigate('/deck/' + d.id)} />
    </div>
  );
}

function PrefsMenu() {
  const t = useT();
  const settings = useStore((s) => s.lib.settings);
  return (
    <Menu>
      <Tooltip text={t('Language and theme')}>
        <MenuTrigger asChild>
          <button className="icon-btn" aria-label={t('Language and theme')}>
            {settings.language === 'hi' ? <span className="lang-badge">हि</span> : <Languages size={18} />}
          </button>
        </MenuTrigger>
      </Tooltip>
      <MenuContent>
        <MenuLabel>{t('Language')}</MenuLabel>
        <MenuRadioGroup value={settings.language} onChange={(v) => updateSettings({ language: v as 'en' | 'hi' })}>
          <MenuRadio value="en">English</MenuRadio>
          <MenuRadio value="hi">हिन्दी</MenuRadio>
        </MenuRadioGroup>
        <MenuSep />
        <MenuLabel>{t('Theme')}</MenuLabel>
        <MenuRadioGroup value={settings.theme} onChange={(v) => updateSettings({ theme: v as 'light' | 'dark' | 'system' })}>
          <MenuRadio value="light">
            <Sun size={14} className="inline-icon" /> {t('Light')}
          </MenuRadio>
          <MenuRadio value="dark">
            <Moon size={14} className="inline-icon" /> {t('Dark')}
          </MenuRadio>
          <MenuRadio value="system">
            <Monitor size={14} className="inline-icon" /> {t('Match my device')}
          </MenuRadio>
        </MenuRadioGroup>
        <MenuSep />
        <MenuItem icon={<CircleHelp size={15} />} onSelect={() => navigate('/help')} shortcut="?">
          {t('Help and shortcuts')}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function TopBar({ onMenu, onSearch, picker, onSignIn }: { onMenu: () => void; onSearch: () => void; picker: ReturnType<typeof usePhotoPicker>; onSignIn: () => void }) {
  const t = useT();
  return (
    <header className="topbar">
      <IconButton label={t('Open menu')} className="only-mobile" onClick={onMenu}>
        <MenuIcon size={20} />
      </IconButton>
      <a href="#/" className="only-mobile topbar-logo" aria-label="Flashcard Pro">
        <Logo compact />
      </a>
      <button className="search-btn" onClick={onSearch}>
        <Search size={16} />
        <span className="search-text">{t('Search cards, decks and actions')}</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <span className="toolbar-flex" />
      <FocusTimerButton />
      <PrefsMenu />
      <span className="only-desktop">
        <SyncChipTop />
      </span>
      <AccountMenu onSignIn={onSignIn} />
      <AddMenu picker={picker} />
    </header>
  );
}

function SyncChipTop() {
  const status = useStore((s) => s.syncStatus);
  return status === 'paused' || status === 'error' || status === 'offline' ? <SyncChip /> : null;
}

function BottomNav({ picker, onMore }: { picker: ReturnType<typeof usePhotoPicker>; onMore: () => void }) {
  const t = useT();
  const route = useRoute();
  const item = (to: string, icon: ReactNode, label: string) => (
    <a href={'#' + to} className={'bottom-item' + (route.path === to ? ' is-active' : '')}>
      {icon}
      <span>{label}</span>
    </a>
  );
  return (
    <nav className="bottom-nav" aria-label={t('Quick navigation')}>
      {item('/', <Home size={20} />, t('Home'))}
      {item('/browse', <Library size={20} />, t('Cards'))}
      <button className="bottom-add" onClick={picker.open} aria-label={t('Add photos')}>
        <ImagePlus size={24} />
      </button>
      {item('/stats', <BarChart3 size={20} />, t('Progress'))}
      <button className="bottom-item" onClick={onMore}>
        <MoreHorizontal size={20} />
        <span>{t('More')}</span>
      </button>
    </nav>
  );
}

// ---------- global drop zone ----------
function DropZone() {
  const t = useT();
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types || [])].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overFn = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      if ((e.target as HTMLElement).closest?.('.drop-local')) return;
      if (e.dataTransfer?.files?.length) addPhotos(e.dataTransfer.files);
    };
    const paste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"], .rich-field')) return;
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        addPhotos(files);
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
    };
  }, []);
  if (!over) return null;
  return (
    <div className="dropzone" aria-hidden="true">
      <div className="dropzone-card">
        <ImagePlus size={40} />
        <b>{t('Drop photos to make cards')}</b>
        <span>{t('You can edit each one right after.')}</span>
      </div>
    </div>
  );
}

export function Shell({ children, onSearch, fullBleed = false, noBottomNav = false }: { children: ReactNode; onSearch: () => void; fullBleed?: boolean; noBottomNav?: boolean }) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const picker = usePhotoPicker();
  const signIn = useSignIn();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[role="dialog"], .study-page, .img-editor')) return;
      if (e.key === 'p') picker.open();
      if (e.key === 'n') navigate('/note/new');
      if (e.key === '?') navigate('/help');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picker]);
  return (
    <div className={'app' + (fullBleed ? ' is-full' : '') + (noBottomNav ? ' no-bottom' : '')}>
      {!fullBleed && (
        <aside className="app-side only-desktop">
          <Sidebar onSignIn={signIn.run} />
        </aside>
      )}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title={t('Menu')}>
        <Sidebar onSignIn={signIn.run} onNavigate={() => setMenuOpen(false)} />
      </Sheet>
      <div className="app-main">
        {!fullBleed && <TopBar onMenu={() => setMenuOpen(true)} onSearch={onSearch} picker={picker} onSignIn={signIn.run} />}
        <main className="app-content" id="main">
          {children}
        </main>
        {!fullBleed && <BottomNav picker={picker} onMore={() => setMenuOpen(true)} />}
      </div>
      {picker.inputs}
      <DropZone />
      {signIn.dialogs}
    </div>
  );
}

