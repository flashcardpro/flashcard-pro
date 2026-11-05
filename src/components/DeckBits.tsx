import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Deck, DeckColor, Library } from '../lib/types';
import { DECK_COLORS } from '../lib/types';
import { useStore, createDeck } from '../lib/store';
import { useT } from '../lib/i18n';
import { Button, DeckSwatch, Dialog, Field, Select, type Option } from './ui';

export function deckTree(lib: Library): { deck: Deck; depth: number }[] {
  const decks = Object.values(lib.decks);
  const byParent = new Map<string | null, Deck[]>();
  for (const d of decks) {
    const p = d.parentId && lib.decks[d.parentId] ? d.parentId : null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(d);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const out: { deck: Deck; depth: number }[] = [];
  const walk = (p: string | null, depth: number) => {
    for (const d of byParent.get(p) || []) {
      out.push({ deck: d, depth });
      walk(d.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function deckPath(lib: Library, id: string): string {
  const parts: string[] = [];
  let d: Deck | undefined = lib.decks[id];
  let guard = 0;
  while (d && guard++ < 20) {
    parts.unshift(d.name);
    d = d.parentId ? lib.decks[d.parentId] : undefined;
  }
  return parts.join(' / ');
}

export function DeckPicker({ value, onChange, allowNew = true, exclude }: { value: string; onChange: (id: string) => void; allowNew?: boolean; exclude?: string }) {
  const t = useT();
  const decks = useStore((s) => s.lib.decks);
  const lib = useStore((s) => s.lib);
  const [creating, setCreating] = useState(false);
  const options: Option[] = useMemo(
    () =>
      deckTree(lib)
        .filter((x) => x.deck.id !== exclude)
        .map(({ deck, depth }) => ({
          value: deck.id,
          label: (
            <span className="deck-opt" style={{ paddingLeft: depth * 14 }}>
              <DeckSwatch color={deck.color} />
              {deck.name}
            </span>
          ),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decks, exclude],
  );
  return (
    <div className="deck-picker">
      <Select value={value} onChange={(v) => (v === '__new' ? setCreating(true) : onChange(v))} label={t('Deck')} options={allowNew ? [...options, { value: '__new', label: <span className="deck-opt"><Plus size={14} />{t('New deck...')}</span> }] : options} placeholder={t('Choose a deck')} />
      <DeckFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(d) => {
          onChange(d.id);
          setCreating(false);
        }}
      />
    </div>
  );
}

export function ColorChooser({ value, onChange }: { value: DeckColor; onChange: (c: DeckColor) => void }) {
  const t = useT();
  return (
    <div className="color-chooser" role="radiogroup" aria-label={t('Deck color')}>
      {DECK_COLORS.map((c) => (
        <button key={c} role="radio" aria-checked={value === c} aria-label={t(colorName(c))} className={`deck-color-btn deck-${c}` + (value === c ? ' is-on' : '')} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

export function colorName(c: DeckColor): string {
  return { red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', teal: 'Teal', blue: 'Blue', indigo: 'Indigo', purple: 'Purple', pink: 'Pink', graphite: 'Graphite' }[c];
}

export function DeckFormDialog({
  open,
  onOpenChange,
  deck,
  parentId = null,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deck?: Deck;
  parentId?: string | null;
  onSaved?: (d: Deck) => void;
}) {
  const t = useT();
  const lib = useStore((s) => s.lib);
  const [name, setName] = useState(deck?.name || '');
  const [color, setColor] = useState<DeckColor>(deck?.color || (DECK_COLORS[(Object.keys(lib.decks).length + 5) % DECK_COLORS.length] as DeckColor));
  const [parent, setParent] = useState<string>(deck?.parentId || parentId || '');
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName(deck?.name || '');
      setColor(deck?.color || (DECK_COLORS[(Object.keys(lib.decks).length + 5) % DECK_COLORS.length] as DeckColor));
      setParent(deck?.parentId || parentId || '');
    }
  }
  const parentOptions: Option[] = [{ value: '', label: t('None (top level)') }, ...deckTree(lib).filter((x) => x.deck.id !== deck?.id).map(({ deck: d, depth }) => ({ value: d.id, label: <span className="deck-opt" style={{ paddingLeft: depth * 14 }}><DeckSwatch color={d.color} />{d.name}</span> }))];
  function save() {
    if (!name.trim()) return;
    if (deck) {
      useStore.getState().mutate((l) => {
        l.decks = { ...l.decks, [deck.id]: { ...deck, name: name.trim(), color, parentId: parent || null, updatedAt: Date.now() } };
      });
      onSaved?.({ ...deck, name: name.trim(), color, parentId: parent || null });
    } else {
      const d = createDeck(name, color, parent || null);
      onSaved?.(d);
    }
    onOpenChange(false);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={deck ? t('Edit deck') : t('New deck')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            {deck ? t('Save deck') : t('Create deck')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="stack"
      >
        <Field label={t('Name')} htmlFor="deck-name">
          <input id="deck-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('For example: Biology chapter 3')} />
        </Field>
        <Field label={t('Color')}>
          <ColorChooser value={color} onChange={setColor} />
        </Field>
        <Field label={t('Inside another deck')}>
          <Select value={parent} onChange={setParent} options={parentOptions} label={t('Inside another deck')} />
        </Field>
      </form>
    </Dialog>
  );
}

export function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const tags = raw
      .split(/[,\s]+/)
      .map((s) => s.trim().replace(/^#/, ''))
      .filter(Boolean);
    if (!tags.length) return;
    onChange([...new Set([...value, ...tags])]);
    setText('');
  };
  return (
    <div className="tag-input">
      {value.map((tag) => (
        <span key={tag} className="tag">
          #{tag}
          <button aria-label={t('Remove tag {tag}', { tag })} onClick={() => onChange(value.filter((x) => x !== tag))}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        className="tag-field"
        value={text}
        placeholder={value.length ? '' : t('Add tags, press Enter')}
        aria-label={t('Tags')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(text)}
      />
    </div>
  );
}

export function NewDeckButton({ parentId = null, variant = 'secondary' }: { parentId?: string | null; variant?: 'secondary' | 'ghost' | 'primary' }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} icon={<Plus size={16} />} onClick={() => setOpen(true)}>
        {t('New deck')}
      </Button>
      <DeckFormDialog open={open} onOpenChange={setOpen} parentId={parentId} />
    </>
  );
}
