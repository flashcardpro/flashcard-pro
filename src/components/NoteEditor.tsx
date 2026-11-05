import { useRef, useState } from 'react';
import { Brackets, Flag, ImagePlus, Images, Layers, Repeat, Trash2, Eye, Check } from 'lucide-react';
import type { Card, FlagColor, Note, NoteType } from '../lib/types';
import { FLAG_COLORS } from '../lib/types';
import { useT } from '../lib/i18n';
import { addImageMedia } from '../lib/store';
import { primeMediaUrl } from '../lib/media';
import { getMediaBlob } from '../lib/db';
import { ordsForNote, cardId } from '../lib/cards';
import { emptySrs } from '../lib/srs';
import { ImageEditor } from './ImageEditor';
import { RichField } from './RichField';
import { AudioRecorder } from './Audio';
import { DeckPicker, TagInput } from './DeckBits';
import { Button, Dialog, Field, Menu, MenuContent, MenuItem, MenuSep, MenuTrigger, Segmented, Tooltip, IconButton } from './ui';
import { CardFaceView } from './CardFace';

export const FLAG_HEX: Record<FlagColor, string> = { red: '#E5484D', orange: '#F08C00', green: '#16A34A', blue: '#2B55E6', purple: '#7C4DDB' };
const FLAG_NAMES: Record<FlagColor, string> = { red: 'Red label', orange: 'Orange label', green: 'Green label', blue: 'Blue label', purple: 'Purple label' };

export function noteProblem(note: Note): string | null {
  if (note.type === 'cloze' && ordsForNote(note).length === 0) return 'Add at least one blank: select words and press Make blank.';
  if (note.type === 'occlusion' && !note.image) return 'Add a photo to hide parts of it.';
  if (note.type === 'occlusion' && note.image && note.image.masks.length === 0) return 'Drag a box over the photo to hide at least one part.';
  if ((note.type === 'basic' || note.type === 'reverse') && !note.front.trim() && !note.image && !note.audioFront) return 'Write something on the front, or add a photo.';
  if (note.type === 'reverse' && !note.back.trim() && !note.image) return 'A two-way card needs a back side too.';
  return null;
}

export function FlagMenu({ value, onChange }: { value: FlagColor | null; onChange: (f: FlagColor | null) => void }) {
  const t = useT();
  return (
    <Menu>
      <Tooltip text={t('Color label')}>
        <MenuTrigger asChild>
          <button className="btn btn-ghost btn-sm" aria-label={t('Color label')}>
            <Flag size={15} fill={value ? FLAG_HEX[value] : 'none'} color={value ? FLAG_HEX[value] : 'currentColor'} />
            <span>{value ? t(FLAG_NAMES[value]) : t('No label')}</span>
          </button>
        </MenuTrigger>
      </Tooltip>
      <MenuContent align="start">
        {FLAG_COLORS.map((f) => (
          <MenuItem key={f} icon={<Flag size={15} fill={FLAG_HEX[f]} color={FLAG_HEX[f]} />} onSelect={() => onChange(f)} hint={value === f ? <Check size={14} /> : null}>
            {t(FLAG_NAMES[f])}
          </MenuItem>
        ))}
        <MenuSep />
        <MenuItem icon={<Flag size={15} />} onSelect={() => onChange(null)}>
          {t('No label')}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function NoteEditor({ note, onChange, showDeck = true }: { note: Note; onChange: (n: Note) => void; showDeck?: boolean }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const set = (patch: Partial<Note>) => onChange({ ...note, ...patch });

  async function attachPhoto(f: File) {
    const meta = await addImageMedia(f, f.name);
    const blob = await getMediaBlob(meta.id);
    if (blob) primeMediaUrl(meta.id, blob);
    set({ image: { mediaId: meta.id, width: meta.width || 1, height: meta.height || 1, masks: [], annotations: [], side: 'front', occlusionMode: 'hideAll' } });
  }

  const typeOptions = [
    { value: 'basic', label: t('Basic'), icon: <Layers size={15} /> },
    { value: 'reverse', label: t('Both ways'), icon: <Repeat size={15} /> },
    { value: 'cloze', label: t('Fill the blank'), icon: <Brackets size={15} /> },
    { value: 'occlusion', label: t('Hide parts of photo'), icon: <Images size={15} /> },
  ];
  const cardCount = ordsForNote(note).length;
  const problem = noteProblem(note);

  const frontLabel = note.type === 'cloze' ? t('Text with blanks') : note.type === 'occlusion' ? t('Question or title (optional)') : t('Front');
  const backLabel = note.type === 'cloze' || note.type === 'occlusion' ? t('Extra notes shown with the answer') : t('Back');

  return (
    <div className="note-editor">
      <div className="note-meta">
        <Segmented value={note.type} onChange={(v) => set({ type: v as NoteType })} options={typeOptions} label={t('Card type')} />
        <div className="note-meta-right">
          {showDeck && <DeckPicker value={note.deckId} onChange={(deckId) => set({ deckId })} />}
          <FlagMenu value={note.flag} onChange={(flag) => set({ flag })} />
        </div>
      </div>

      {note.image ? (
        <section className="note-photo">
          <div className="note-photo-head">
            {note.type !== 'occlusion' && (
              <Segmented
                size="sm"
                value={note.image.side}
                onChange={(side) => set({ image: { ...note.image!, side: side as 'front' | 'back' } })}
                label={t('Photo goes on')}
                options={[
                  { value: 'front', label: t('Photo on front') },
                  { value: 'back', label: t('Photo on back') },
                ]}
              />
            )}
            {note.type !== 'occlusion' && (
              <Button size="sm" variant="ghost" icon={<Images size={15} />} onClick={() => set({ type: 'occlusion' })}>
                {t('Hide parts instead')}
              </Button>
            )}
            <span className="toolbar-flex" />
            <Menu>
              <MenuTrigger asChild>
                <button className="btn btn-ghost btn-sm">{t('Photo')}</button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<ImagePlus size={15} />} onSelect={() => fileRef.current?.click()}>
                  {t('Replace photo')}
                </MenuItem>
                <MenuItem icon={<Trash2 size={15} />} danger onSelect={() => set({ image: null, type: note.type === 'occlusion' ? 'basic' : note.type })}>
                  {t('Remove photo')}
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
          <ImageEditor image={note.image} onChange={(image) => set({ image })} focusMasks={note.type === 'occlusion'} />
        </section>
      ) : (
        <button className="photo-slot" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={20} />
          <span>{note.type === 'occlusion' ? t('Choose the photo to hide parts of') : t('Add a photo (optional)')}</span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) attachPhoto(f);
          e.target.value = '';
        }}
      />

      <div className={'note-fields' + (note.type === 'cloze' ? ' is-cloze' : '')}>
        <Field label={frontLabel}>
          <RichField
            value={note.front}
            onChange={(front) => set({ front })}
            cloze={note.type === 'cloze'}
            ariaLabel={frontLabel}
            placeholder={note.type === 'cloze' ? t('The heart has {{c1::four}} chambers. Select words and press Make blank.') : note.type === 'occlusion' ? t('For example: Label the parts of the cell') : t('Question, word or prompt')}
          />
          <AudioRecorder value={note.audioFront} onChange={(audioFront) => set({ audioFront })} label={t('Record voice note for the front')} />
        </Field>
        {note.type !== 'cloze' && (
          <Field label={backLabel}>
            <RichField value={note.back} onChange={(back) => set({ back })} ariaLabel={backLabel} placeholder={note.type === 'occlusion' ? t('Anything to remember with the answer') : t('Answer')} />
            <AudioRecorder value={note.audioBack} onChange={(audioBack) => set({ audioBack })} label={t('Record voice note for the back')} />
          </Field>
        )}
        {note.type === 'cloze' && (
          <Field label={backLabel}>
            <RichField value={note.extra} onChange={(extra) => set({ extra })} ariaLabel={backLabel} minimal placeholder={t('Optional explanation')} />
            <AudioRecorder value={note.audioBack} onChange={(audioBack) => set({ audioBack })} label={t('Record voice note for the answer')} />
          </Field>
        )}
      </div>

      <div className="note-foot-meta">
        <Field label={t('Tags')}>
          <TagInput value={note.tags} onChange={(tags) => set({ tags })} />
        </Field>
        <div className="note-cardcount">
          <span className={'count-chip' + (problem ? ' is-warn' : '')}>{problem ? t(problem) : cardCount === 1 ? t('Makes 1 card') : t('Makes {n} cards', { n: cardCount })}</span>
          <IconButton label={t('Preview cards')} onClick={() => setPreviewOpen(true)} disabled={!!problem}>
            <Eye size={17} />
          </IconButton>
        </div>
      </div>
      <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} note={note} />
    </div>
  );
}

function PreviewDialog({ open, onOpenChange, note }: { open: boolean; onOpenChange: (v: boolean) => void; note: Note }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const ords = ordsForNote(note);
  const ord = ords[Math.min(i, ords.length - 1)];
  if (!ord) return null;
  const card: Card = { id: cardId(note.id, ord), noteId: note.id, deckId: note.deckId, ord, srs: emptySrs(), suspended: false, buriedUntil: null, createdAt: 0, updatedAt: 0 };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        setRevealed(false);
        setI(0);
      }}
      title={t('Preview: card {a} of {b}', { a: Math.min(i, ords.length - 1) + 1, b: ords.length })}
      size="lg"
      footer={
        <>
          <Button variant="ghost" disabled={i === 0} onClick={() => (setI(i - 1), setRevealed(false))}>
            {t('Previous')}
          </Button>
          <Button onClick={() => setRevealed(!revealed)}>{revealed ? t('Show question') : t('Show answer')}</Button>
          <Button variant="ghost" disabled={i >= ords.length - 1} onClick={() => (setI(i + 1), setRevealed(false))}>
            {t('Next')}
          </Button>
        </>
      }
    >
      <div className="index-card preview-card">
        <CardFaceView note={note} card={card} revealed={revealed} />
      </div>
    </Dialog>
  );
}
