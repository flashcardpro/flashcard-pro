import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, LayoutGrid, List as ListIcon, ArrowUpDown, Flag, FolderInput, Pause, Play, RotateCcw, Trash2, Pencil, X, CheckSquare, Square, Tag } from 'lucide-react';
import type { Card, CardStatus, FlagColor, Note, NoteType } from '../lib/types';
import { FLAG_COLORS } from '../lib/types';
import { useStore, deleteNotes, moveNotes, setNotesFlag, updateCards, resetCards } from '../lib/store';
import { useT } from '../lib/i18n';
import { statusOf, deckDescendants } from '../lib/srs';
import { noteTitle } from '../lib/cards';
import { stripHtml } from '../lib/util';
import { navigate } from '../lib/router';
import { Button, Ctx, CtxContent, CtxItem, CtxSep, CtxSub, CtxTrigger, DeckSwatch, Dialog, Empty, Menu, MenuCheck, MenuContent, MenuItem, MenuLabel, MenuSep, MenuSub, MenuTrigger, Segmented, Select, StatusPill, IconButton } from './ui';
import { CardThumb } from './CardFace';
import { FLAG_HEX } from './NoteEditor';
import { deckTree } from './DeckBits';
import { RichHtml } from './RichHtml';
import { toast } from 'sonner';

const STATUS_ORDER: CardStatus[] = ['due', 'learning', 'new', 'review', 'mastered', 'suspended'];

export function noteStatus(cards: Card[]): CardStatus {
  if (!cards.length) return 'new';
  const ss = cards.map((c) => statusOf(c));
  for (const s of STATUS_ORDER) if (ss.includes(s) && (s !== 'suspended' || ss.every((x) => x === 'suspended'))) return s;
  return ss[0];
}

type Sort = 'newest' | 'oldest' | 'due' | 'az' | 'hard';

export function CardBrowser({ deckId, includeSub = true }: { deckId?: string; includeSub?: boolean }) {
  const t = useT();
  const lib = useStore((s) => s.lib);
  const [q, setQ] = useState('');
  const [statuses, setStatuses] = useState<CardStatus[]>([]);
  const [types, setTypes] = useState<NoteType[]>([]);
  const [flags, setFlags] = useState<(FlagColor | 'none')[]>([]);
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('fcp-view') as 'grid' | 'list') || 'grid');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState<string[] | null>(null);

  const cardsByNote = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const c of Object.values(lib.cards)) {
      if (!m.has(c.noteId)) m.set(c.noteId, []);
      m.get(c.noteId)!.push(c);
    }
    return m;
  }, [lib.cards]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const n of Object.values(lib.notes)) n.tags.forEach((x) => s.add(x));
    return [...s].sort();
  }, [lib.notes]);

  const notes = useMemo(() => {
    const deckSet = deckId ? new Set(includeSub ? deckDescendants(lib, deckId) : [deckId]) : null;
    const needle = q.trim().toLowerCase();
    let list = Object.values(lib.notes).filter((n) => !deckSet || deckSet.has(n.deckId));
    if (needle)
      list = list.filter((n) =>
        (stripHtml(n.front) + ' ' + stripHtml(n.back) + ' ' + stripHtml(n.extra) + ' ' + n.tags.join(' ') + ' ' + (n.image?.masks.map((m) => m.label).join(' ') || '')).toLowerCase().includes(needle),
      );
    if (types.length) list = list.filter((n) => types.includes(n.type));
    if (flags.length) list = list.filter((n) => flags.includes(n.flag || 'none'));
    if (tag) list = list.filter((n) => n.tags.includes(tag));
    if (statuses.length) list = list.filter((n) => (cardsByNote.get(n.id) || []).some((c) => statuses.includes(statusOf(c))));
    const due = (n: Note) => Math.min(...(cardsByNote.get(n.id) || []).map((c) => (c.srs.state === 0 ? Infinity : c.srs.due)));
    const lapses = (n: Note) => Math.max(0, ...(cardsByNote.get(n.id) || []).map((c) => c.srs.lapses));
    list.sort((a, b) => {
      if (sort === 'newest') return b.createdAt - a.createdAt;
      if (sort === 'oldest') return a.createdAt - b.createdAt;
      if (sort === 'due') return due(a) - due(b);
      if (sort === 'hard') return lapses(b) - lapses(a);
      return noteTitle(a).localeCompare(noteTitle(b));
    });
    return list;
  }, [lib, deckId, includeSub, q, types, flags, tag, statuses, sort, cardsByNote]);

  const toggle = (id: string) => {
    const s = new Set(sel);
    s.has(id) ? s.delete(id) : s.add(id);
    setSel(s);
  };
  const selIds = [...sel].filter((id) => lib.notes[id]);
  const cardIdsOf = (ids: string[]) => ids.flatMap((id) => (cardsByNote.get(id) || []).map((c) => c.id));
  const filterCount = statuses.length + types.length + flags.length + (tag ? 1 : 0);
  const decks = deckTree(lib);

  const actions = (ids: string[], I: typeof CtxItem, Sub: typeof CtxSub, Sep: typeof CtxSep) => {
    const cards = cardIdsOf(ids).map((id) => lib.cards[id]).filter(Boolean);
    const allPaused = cards.length > 0 && cards.every((c) => c.suspended);
    return (
      <>
        {ids.length === 1 && (
          <I icon={<Pencil size={15} />} onSelect={() => navigate('/note/' + ids[0])}>
            {t('Edit')}
          </I>
        )}
        <Sub icon={<Flag size={15} />} label={t('Color label')}>
          {FLAG_COLORS.map((f) => (
            <I key={f} icon={<Flag size={15} fill={FLAG_HEX[f]} color={FLAG_HEX[f]} />} onSelect={() => setNotesFlag(ids, f)}>
              {t(f[0].toUpperCase() + f.slice(1) + ' label')}
            </I>
          ))}
          <Sep />
          <I icon={<X size={15} />} onSelect={() => setNotesFlag(ids, null)}>
            {t('No label')}
          </I>
        </Sub>
        <Sub icon={<FolderInput size={15} />} label={t('Move to deck')}>
          {decks.map(({ deck, depth }) => (
            <I key={deck.id} icon={<DeckSwatch color={deck.color} />} onSelect={() => (moveNotes(ids, deck.id), toast.success(t('Moved to {name}', { name: deck.name })))}>
              <span style={{ paddingLeft: depth * 10 }}>{deck.name}</span>
            </I>
          ))}
        </Sub>
        <I icon={allPaused ? <Play size={15} /> : <Pause size={15} />} onSelect={() => updateCards(cardIdsOf(ids), () => ({ suspended: !allPaused }))}>
          {allPaused ? t('Resume studying') : t('Pause (skip in reviews)')}
        </I>
        <I icon={<RotateCcw size={15} />} onSelect={() => (resetCards(cardIdsOf(ids)), toast(t('Progress reset. These cards are new again.')))}>
          {t('Reset progress')}
        </I>
        <Sep />
        <I icon={<Trash2 size={15} />} danger onSelect={() => setConfirmDel(ids)}>
          {t('Delete')}
        </I>
      </>
    );
  };
  const DMI = MenuItem as unknown as typeof CtxItem;
  const DMS = MenuSub as unknown as typeof CtxSub;
  const DMP = MenuSep as unknown as typeof CtxSep;

  const typeLabel: Record<NoteType, string> = { basic: t('Basic'), reverse: t('Both ways'), cloze: t('Fill the blank'), occlusion: t('Hidden parts') };
  const statusLabel: Record<CardStatus, string> = { new: t('New'), learning: t('Learning'), due: t('Due'), review: t('Reviewing'), mastered: t('Mastered'), suspended: t('Paused') };

  return (
    <div className="browser">
      <div className="browser-bar">
        <label className="search-field">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search in cards')} aria-label={t('Search in cards')} />
          {q && (
            <button aria-label={t('Clear search')} onClick={() => setQ('')}>
              <X size={14} />
            </button>
          )}
        </label>
        <Menu>
          <MenuTrigger asChild>
            <button className={'btn btn-secondary btn-md' + (filterCount ? ' has-count' : '')}>
              <SlidersHorizontal size={16} />
              <span>{t('Filter')}</span>
              {filterCount > 0 && <span className="btn-count">{filterCount}</span>}
            </button>
          </MenuTrigger>
          <MenuContent align="start" className="menu-wide">
            <MenuLabel>{t('Status')}</MenuLabel>
            {(['new', 'learning', 'due', 'review', 'mastered', 'suspended'] as CardStatus[]).map((s) => (
              <MenuCheck key={s} checked={statuses.includes(s)} onChange={(v) => setStatuses(v ? [...statuses, s] : statuses.filter((x) => x !== s))} icon={<span className={'dot status-' + s} />}>
                {statusLabel[s]}
              </MenuCheck>
            ))}
            <MenuSep />
            <MenuSub icon={<Square size={15} />} label={t('Card type') + (types.length ? ` (${types.length})` : '')}>
              {(['basic', 'reverse', 'cloze', 'occlusion'] as NoteType[]).map((ty) => (
                <MenuCheck key={ty} checked={types.includes(ty)} onChange={(v) => setTypes(v ? [...types, ty] : types.filter((x) => x !== ty))}>
                  {typeLabel[ty]}
                </MenuCheck>
              ))}
            </MenuSub>
            <MenuSub icon={<Flag size={15} />} label={t('Color label') + (flags.length ? ` (${flags.length})` : '')}>
              {FLAG_COLORS.map((f) => (
                <MenuCheck key={f} checked={flags.includes(f)} onChange={(v) => setFlags(v ? [...flags, f] : flags.filter((x) => x !== f))} icon={<Flag size={15} fill={FLAG_HEX[f]} color={FLAG_HEX[f]} />}>
                  {t(f[0].toUpperCase() + f.slice(1) + ' label')}
                </MenuCheck>
              ))}
              <MenuCheck checked={flags.includes('none')} onChange={(v) => setFlags(v ? [...flags, 'none'] : flags.filter((x) => x !== 'none'))}>
                {t('No label')}
              </MenuCheck>
            </MenuSub>
            {allTags.length > 0 && (
              <MenuSub icon={<Tag size={15} />} label={t('Tag') + (tag ? `: ${tag}` : '')}>
                <MenuItem onSelect={() => setTag('')}>{t('Any tag')}</MenuItem>
                {allTags.slice(0, 40).map((x) => (
                  <MenuItem key={x} onSelect={() => setTag(x)}>
                    #{x}
                  </MenuItem>
                ))}
              </MenuSub>
            )}
            {filterCount > 0 && (
              <>
                <MenuSep />
                <MenuItem icon={<X size={15} />} onSelect={() => (setStatuses([]), setTypes([]), setFlags([]), setTag(''))}>
                  {t('Clear all filters')}
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
        <div className="sort-select">
          <ArrowUpDown size={15} />
          <Select
            size="sm"
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            label={t('Sort')}
            options={[
              { value: 'newest', label: t('Newest first') },
              { value: 'oldest', label: t('Oldest first') },
              { value: 'due', label: t('Due soonest') },
              { value: 'hard', label: t('Most forgotten') },
              { value: 'az', label: t('A to Z') },
            ]}
          />
        </div>
        <span className="toolbar-flex" />
        <Segmented
          size="sm"
          value={view}
          onChange={(v) => (setView(v), localStorage.setItem('fcp-view', v))}
          label={t('View')}
          options={[
            { value: 'grid', label: '', icon: <LayoutGrid size={16} /> },
            { value: 'list', label: '', icon: <ListIcon size={16} /> },
          ]}
        />
      </div>

      {(statuses.length > 0 || types.length > 0 || flags.length > 0 || tag) && (
        <div className="chips">
          {statuses.map((s) => (
            <button key={s} className={'chip status-' + s} onClick={() => setStatuses(statuses.filter((x) => x !== s))}>
              <span className="pill-dot" />
              {statusLabel[s]} <X size={12} />
            </button>
          ))}
          {types.map((ty) => (
            <button key={ty} className="chip" onClick={() => setTypes(types.filter((x) => x !== ty))}>
              {typeLabel[ty]} <X size={12} />
            </button>
          ))}
          {flags.map((f) => (
            <button key={f} className="chip" onClick={() => setFlags(flags.filter((x) => x !== f))}>
              <Flag size={12} fill={f === 'none' ? 'none' : FLAG_HEX[f]} color={f === 'none' ? 'currentColor' : FLAG_HEX[f]} /> {f === 'none' ? t('No label') : t(f[0].toUpperCase() + f.slice(1) + ' label')} <X size={12} />
            </button>
          ))}
          {tag && (
            <button className="chip" onClick={() => setTag('')}>
              #{tag} <X size={12} />
            </button>
          )}
        </div>
      )}

      {selIds.length > 0 && (
        <div className="bulk-bar" role="region" aria-label={t('Selected cards')}>
          <b>{selIds.length === 1 ? t('1 selected') : t('{n} selected', { n: selIds.length })}</b>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set(notes.map((n) => n.id)))}>
            {t('Select all {n}', { n: notes.length })}
          </Button>
          <span className="toolbar-flex" />
          <Menu>
            <MenuTrigger asChild>
              <button className="btn btn-sm btn-secondary">{t('Actions')}</button>
            </MenuTrigger>
            <MenuContent>{actions(selIds, DMI, DMS, DMP)}</MenuContent>
          </Menu>
          <IconButton label={t('Clear selection')} onClick={() => setSel(new Set())}>
            <X size={16} />
          </IconButton>
        </div>
      )}

      {notes.length === 0 ? (
        <Empty title={q || filterCount ? t('No cards match') : t('No cards here yet')}>{q || filterCount ? t('Try a different word or clear the filters.') : t('Add photos or write a card to fill this deck.')}</Empty>
      ) : (
        <ul className={'card-' + view}>
          {notes.slice(0, 600).map((n) => {
            const cs = cardsByNote.get(n.id) || [];
            const status = noteStatus(cs);
            const title = noteTitle(n);
            return (
              <li key={n.id}>
                <Ctx>
                  <CtxTrigger asChild>
                    <article className={`card-tile status-edge-${status}` + (sel.has(n.id) ? ' is-selected' : '')} onClick={() => navigate('/note/' + n.id)}>
                      <button
                        className="tile-check"
                        aria-label={sel.has(n.id) ? t('Unselect') : t('Select')}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(n.id);
                        }}
                      >
                        {sel.has(n.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                      {n.image && view === 'grid' && (
                        <div className="tile-photo">
                          <CardThumb note={n} />
                        </div>
                      )}
                      {n.image && view === 'list' && (
                        <div className="tile-photo-sm">
                          <CardThumb note={n} />
                        </div>
                      )}
                      <div className="tile-body">
                        {title ? <p className="tile-title">{title}</p> : !n.image && <RichHtml html={n.front} className="tile-title" />}
                        <div className="tile-meta">
                          <StatusPill status={status} />
                          {n.flag && <Flag size={14} fill={FLAG_HEX[n.flag]} color={FLAG_HEX[n.flag]} aria-label={t('Color label')} />}
                          <span className="tile-type">{typeLabel[n.type]}</span>
                          {cs.length > 1 && <span className="tile-count">{t('{n} cards', { n: cs.length })}</span>}
                          {!deckId && lib.decks[n.deckId] && (
                            <span className="tile-deck">
                              <DeckSwatch color={lib.decks[n.deckId].color} size={9} />
                              {lib.decks[n.deckId].name}
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  </CtxTrigger>
                  <CtxContent>{actions([n.id], CtxItem, CtxSub, CtxSep)}</CtxContent>
                </Ctx>
              </li>
            );
          })}
        </ul>
      )}
      {notes.length > 600 && <p className="muted center">{t('Showing the first 600. Search or filter to find the rest.')}</p>}
      <Dialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
        title={confirmDel && confirmDel.length === 1 ? t('Delete this card?') : t('Delete {n} cards?', { n: confirmDel?.length || 0 })}
        description={t('Their study history is deleted too. This cannot be undone.')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteNotes(confirmDel || []);
                setSel(new Set());
                setConfirmDel(null);
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
