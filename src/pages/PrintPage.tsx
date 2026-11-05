import { useMemo, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { cardsInDecks, deckDescendants, statusOf } from '../lib/srs';
import { CardFaceView } from '../components/CardFace';
import { Button, Empty, IconButton, Select, Switch } from '../components/ui';
import type { Card } from '../lib/types';

/** Printable sheets: fronts on one page, backs mirrored on the next, so duplex printing lines up. */
export function PrintPage({ deckId }: { deckId: string }) {
  const t = useT();
  const lib = useStore((s) => s.lib);
  const deck = lib.decks[deckId];
  const [perPage, setPerPage] = useState('8');
  const [which, setWhich] = useState('all');
  const [duplex, setDuplex] = useState(true);
  const [cutLines, setCutLines] = useState(true);
  const cards = useMemo(() => {
    if (!deck) return [];
    let list = cardsInDecks(lib, deckDescendants(lib, deckId)).filter((c) => !c.suspended);
    if (which === 'hard') list = list.filter((c) => c.srs.lapses > 0 || statusOf(c) === 'learning');
    if (which === 'notmastered') list = list.filter((c) => statusOf(c) !== 'mastered');
    return list.sort((a, b) => (lib.notes[a.noteId]?.createdAt || 0) - (lib.notes[b.noteId]?.createdAt || 0));
  }, [lib, deckId, deck, which]);
  if (!deck) return <Empty title={t('This deck does not exist')} />;
  const n = Number(perPage);
  const cols = n === 4 ? 2 : n === 6 ? 2 : 2;
  const pages: Card[][] = [];
  for (let i = 0; i < cards.length; i += n) pages.push(cards.slice(i, i + n));
  const mirror = (page: Card[]) => {
    // swap columns inside each row so a long-edge flip lines backs up with fronts
    const rows: Card[][] = [];
    for (let i = 0; i < page.length; i += cols) rows.push(page.slice(i, i + cols));
    return rows.flatMap((r) => {
      const padded = [...r];
      while (padded.length < cols) padded.push(undefined as unknown as Card);
      return padded.reverse();
    });
  };
  return (
    <div className="print-page">
      <header className="print-controls no-print">
        <IconButton label={t('Back')} onClick={() => history.back()}>
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="page-title">{t('Print {name}', { name: deck.name })}</h1>
        <Select
          size="sm"
          value={perPage}
          onChange={setPerPage}
          label={t('Cards per page')}
          options={[
            { value: '4', label: t('4 large cards per page') },
            { value: '6', label: t('6 cards per page') },
            { value: '8', label: t('8 cards per page') },
          ]}
        />
        <Select
          size="sm"
          value={which}
          onChange={setWhich}
          label={t('Which cards')}
          options={[
            { value: 'all', label: t('All cards ({n})', { n: cardsInDecks(lib, deckDescendants(lib, deckId)).length }) },
            { value: 'notmastered', label: t('Not mastered yet') },
            { value: 'hard', label: t('Hard ones only') },
          ]}
        />
        <label className="inline-switch">
          <Switch checked={duplex} onChange={setDuplex} label={t('Backs on separate pages')} />
          {t('Two-sided')}
        </label>
        <label className="inline-switch">
          <Switch checked={cutLines} onChange={setCutLines} label={t('Cut lines')} />
          {t('Cut lines')}
        </label>
        <span className="toolbar-flex" />
        <Button variant="primary" icon={<Printer size={16} />} onClick={() => window.print()}>
          {t('Print or save PDF')}
        </Button>
      </header>
      <p className="muted small no-print print-tip">{t('Choose "Save as PDF" in the print window to get a PDF. For two-sided printing, flip on the long edge.')}</p>
      <div className={'paper-sheets per-' + n + (cutLines ? ' cut' : '')}>
        {pages.map((page, i) => (
          <div key={i} className="paper-pair">
            <section className="paper-sheet">
              {page.map((c) => (
                <div key={c.id} className="print-card">
                  <span className="print-side">{t('Front')}</span>
                  <CardFaceView note={lib.notes[c.noteId]} card={c} revealed={false} />
                </div>
              ))}
            </section>
            <section className={'paper-sheet' + (duplex ? ' is-back' : ' is-inline')}>
              {(duplex ? mirror(page) : page).map((c, k) =>
                c ? (
                  <div key={c.id + 'b'} className="print-card is-answer">
                    <span className="print-side">{t('Back')}</span>
                    <CardFaceView note={lib.notes[c.noteId]} card={c} revealed />
                  </div>
                ) : (
                  <div key={'blank' + k} className="print-card is-blank" />
                ),
              )}
            </section>
          </div>
        ))}
      </div>
    </div>
  );
}
