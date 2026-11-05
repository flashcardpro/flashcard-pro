import { useEffect, useState } from 'react';
import { ArrowLeft, Save, Plus, Trash2, MoreHorizontal, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, blankNote, saveNote, deleteNotes, ensureDefaultDeck, getLib } from '../lib/store';
import { useStudyAgain } from '../components/StudyAgain';
import { useT } from '../lib/i18n';
import { navigate } from '../lib/router';
import { NoteEditor, noteProblem } from '../components/NoteEditor';
import { Button, Dialog, Empty, Menu, MenuContent, MenuItem, MenuSep, MenuSub, MenuTrigger, IconButton } from '../components/ui';
import type { Note, NoteType } from '../lib/types';
import { uid } from '../lib/util';

export function NotePage({ id, query }: { id: string | null; query: URLSearchParams }) {
  const t = useT();
  const again = useStudyAgain();
  const existing = useStore((s) => (id ? s.lib.notes[id] : undefined));
  const [note, setNote] = useState<Note | null>(() => {
    if (id) return existing ? { ...existing } : null;
    const lib = getLib();
    const wanted = query.get('deck') || localStorage.getItem('fcp-last-deck') || '';
    const deckId = lib.decks[wanted] ? wanted : Object.values(lib.decks).sort((a, b) => a.order - b.order)[0]?.id || '';
    return blankNote(deckId, (query.get('type') as NoteType) || 'basic');
  });

  // First card ever: make a deck for it (outside of render).
  useEffect(() => {
    if (note && !note.deckId) setNote({ ...note, deckId: ensureDefaultDeck().id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [dirty, setDirty] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (id && existing && !dirty) setNote({ ...existing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, existing?.updatedAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        save(!id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!note) return <Empty title={t('This card was deleted or does not exist')} action={<Button onClick={() => navigate('/')}>{t('Go home')}</Button>} />;
  const problem = noteProblem(note);
  const back = () => (history.length > 1 ? history.back() : navigate('/deck/' + note.deckId));

  function save(another: boolean) {
    if (!note) return;
    if (problem) {
      toast.error(t(problem));
      return;
    }
    saveNote(note);
    localStorage.setItem('fcp-last-deck', note.deckId);
    setDirty(false);
    if (another) {
      toast.success(t('Card saved. Ready for the next one.'));
      setNote(blankNote(note.deckId, note.type));
      if (id) navigate(`/note/new?deck=${note.deckId}&type=${note.type}`);
      window.scrollTo({ top: 0 });
    } else {
      toast.success(t('Card saved.'));
      navigate('/deck/' + note.deckId);
    }
  }

  return (
    <div className="page note-page">
      {again.dialog}
      <header className="page-head">
        <IconButton label={t('Back')} onClick={back}>
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="page-title">{id ? t('Edit card') : t('New card')}</h1>
        <span className="toolbar-flex" />
        {id && (
          <Menu>
            <MenuTrigger asChild>
              <button className="icon-btn" aria-label={t('More')}>
                <MoreHorizontal size={18} />
              </button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem
                icon={<Copy size={15} />}
                onSelect={() => {
                  const copy = { ...note, id: uid(), createdAt: Date.now() };
                  saveNote(copy);
                  toast.success(t('Copy made.'));
                  navigate('/note/' + copy.id);
                }}
              >
                {t('Make a copy')}
              </MenuItem>
              {again.items(
                Object.values(getLib().cards)
                  .filter((c) => c.noteId === note.id)
                  .map((c) => c.id),
                MenuItem,
                MenuSub,
                MenuSep,
              )}
              <MenuSep />
              <MenuItem icon={<Trash2 size={15} />} danger onSelect={() => setConfirmDel(true)}>
                {t('Delete card')}
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </header>
      <NoteEditor
        note={note}
        onChange={(n) => {
          setNote(n);
          setDirty(true);
        }}
      />
      <footer className="sticky-actions">
        <span className="muted small hide-sm">{t('Ctrl+Enter saves')}</span>
        <span className="toolbar-flex" />
        <Button variant="ghost" onClick={back}>
          {t('Cancel')}
        </Button>
        {!id && (
          <Button icon={<Plus size={16} />} onClick={() => save(true)} disabled={!!problem}>
            {t('Save and add another')}
          </Button>
        )}
        <Button variant="primary" icon={<Save size={16} />} onClick={() => save(false)} disabled={!!problem}>
          {id ? t('Save changes') : t('Save card')}
        </Button>
      </footer>
      <Dialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title={t('Delete this card?')}
        description={t('Their study history is deleted too. This cannot be undone.')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteNotes([note.id]);
                setConfirmDel(false);
                navigate('/deck/' + note.deckId);
                toast(t('Deleted.'));
              }}
            >
              {t('Delete')}
            </Button>
          </>
        }
      />
    </div>
  );
}
