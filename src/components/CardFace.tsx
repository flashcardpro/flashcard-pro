import { useState } from 'react';
import type { Card, Note } from '../lib/types';
import { faceFor } from '../lib/cards';
import { useT } from '../lib/i18n';
import { RichHtml } from './RichHtml';
import { CardImage } from './CardImage';
import { AudioPlay } from './Audio';

function labelsOf(note: Note, group: number): string {
  return (note.image?.masks || []).filter((m) => m.group === group).map((m) => m.label).filter(Boolean).join(', ');
}

/** A photo card that is one card for the whole photo: tap a box to peek at it, or reveal them all. */
export function isTapCard(note: Note, card: Card): boolean {
  return note.type === 'occlusion' && card.ord === 'all';
}

/** One side of a study card. When revealed, the question stays visible above the answer. */
export function CardFaceView({ note, card, revealed, autoAudio = false }: { note: Note; card: Card; revealed: boolean; autoAudio?: boolean }) {
  const t = useT();
  const [tapped, setTapped] = useState<string[]>([]);
  const face = faceFor(note, card);
  const reversed = note.type === 'reverse' && card.ord === '1';
  const promptAudio = reversed ? note.audioBack : note.audioFront;
  const answerAudio = reversed ? note.audioFront : note.audioBack;

  if (face.kind === 'occlusion' && note.image && face.maskGroup == null) {
    const labels = note.image.masks.map((m) => m.label).filter(Boolean);
    return (
      <div className="face face-occlusion">
        {face.promptHtml && <RichHtml html={face.promptHtml} className="face-header" />}
        <CardImage
          image={note.image}
          view={revealed ? { mode: 'reveal' } : { mode: 'tap', revealed: tapped }}
          onMaskClick={revealed ? undefined : (m) => setTapped((x) => (x.includes(m.id) ? x.filter((id) => id !== m.id) : [...x, m.id]))}
          className="face-photo"
        />
        {!revealed && note.image.masks.length > 1 && <p className="tap-hint">{t('Tap a box to peek at one answer. Show answer reveals them all.')}</p>}
        {revealed && (labels.length > 0 || face.answerHtml || note.extra) && (
          <div className="face-answer">
            {labels.length > 0 && (
              <ul className="mask-answers">
                {labels.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
            {face.answerHtml && <RichHtml html={face.answerHtml} />}
            {note.extra && <RichHtml html={note.extra} className="face-extra" />}
          </div>
        )}
        <div className="face-audio">
          {promptAudio && <AudioPlay mediaId={promptAudio} autoPlay={autoAudio && !revealed} />}
          {revealed && answerAudio && <AudioPlay mediaId={answerAudio} autoPlay={autoAudio} />}
        </div>
      </div>
    );
  }

  if (face.kind === 'occlusion' && note.image) {
    return (
      <div className="face face-occlusion">
        {face.promptHtml && <RichHtml html={face.promptHtml} className="face-header" />}
        <CardImage image={note.image} view={revealed ? { mode: 'answer', group: face.maskGroup! } : { mode: 'question', group: face.maskGroup! }} className="face-photo" />
        {revealed && (face.answerText || face.answerHtml || note.extra) && (
          <div className="face-answer">
            {labelsOf(note, face.maskGroup!) && <p className="mask-answer">{labelsOf(note, face.maskGroup!)}</p>}
            {face.answerHtml && <RichHtml html={face.answerHtml} />}
            {note.extra && <RichHtml html={note.extra} className="face-extra" />}
          </div>
        )}
        <div className="face-audio">
          {promptAudio && <AudioPlay mediaId={promptAudio} autoPlay={autoAudio && !revealed} />}
          {revealed && answerAudio && <AudioPlay mediaId={answerAudio} autoPlay={autoAudio} />}
        </div>
      </div>
    );
  }

  return (
    <div className={'face face-' + face.kind}>
      <div className="face-prompt">
        {face.imageSide === 'front' && note.image && <CardImage image={note.image} view={{ mode: 'none' }} className="face-photo" />}
        <RichHtml html={revealed && face.kind === 'cloze' ? face.answerHtml : face.promptHtml} className="face-text" />
        {promptAudio && <AudioPlay mediaId={promptAudio} autoPlay={autoAudio && !revealed} />}
      </div>
      {revealed && face.kind !== 'cloze' && (
        <div className="face-answer">
          <hr className="face-rule" />
          {face.imageSide === 'back' && note.image && <CardImage image={note.image} view={{ mode: 'none' }} className="face-photo" />}
          <RichHtml html={face.answerHtml} className="face-text" />
          {note.extra && <RichHtml html={note.extra} className="face-extra" />}
          {answerAudio && <AudioPlay mediaId={answerAudio} autoPlay={autoAudio} />}
        </div>
      )}
      {revealed && face.kind === 'cloze' && (note.extra || answerAudio) && (
        <div className="face-answer">
          <hr className="face-rule" />
          {note.extra && <RichHtml html={note.extra} className="face-extra" />}
          {answerAudio && <AudioPlay mediaId={answerAudio} autoPlay={autoAudio} />}
        </div>
      )}
    </div>
  );
}

/** Small preview used on card tiles. */
export function CardThumb({ note }: { note: Note }) {
  if (note.image) {
    return <CardImage image={note.image} view={note.type === 'occlusion' ? { mode: 'all' } : { mode: 'none' }} className="thumb-photo" />;
  }
  return null;
}
