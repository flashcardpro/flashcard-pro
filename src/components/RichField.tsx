import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { useEffect, useRef, useState } from 'react';
import { Bold, Brackets, Highlighter, ImagePlus, Italic, List, ListOrdered, RemoveFormatting, Sigma, Strikethrough, Underline as UIcon, Baseline } from 'lucide-react';
import { useT } from '../lib/i18n';
import { getMediaUrl, primeMediaUrl } from '../lib/media';
import { addImageMedia } from '../lib/store';
import { nextClozeNumber } from '../lib/cards';
import { hasMath, sanitize } from '../lib/render';
import { IconButton, Menu, MenuContent, MenuItem, MenuTrigger, Tooltip } from './ui';
import { RichHtml } from './RichHtml';

const MediaImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-media-id': {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-media-id'),
        renderHTML: (attrs: Record<string, any>) => (attrs['data-media-id'] ? { 'data-media-id': attrs['data-media-id'] } : {}),
      },
    };
  },
});

const HIGHLIGHTS = [
  { name: 'Yellow', color: '#FFE14D' },
  { name: 'Green', color: '#B7F0C1' },
  { name: 'Blue', color: '#C5D6FF' },
  { name: 'Pink', color: '#FFC9DC' },
  { name: 'Orange', color: '#FFD3A8' },
];
const TEXT_COLORS = [
  { name: 'Ink', color: '' },
  { name: 'Red', color: '#D93036' },
  { name: 'Blue', color: '#2B55E6' },
  { name: 'Green', color: '#16803C' },
  { name: 'Purple', color: '#7C4DDB' },
  { name: 'Orange', color: '#C2570C' },
];

async function hydrate(html: string): Promise<string> {
  const ids = [...html.matchAll(/fcp-media:([\w-]+)/g)].map((m) => m[1]);
  let out = html;
  for (const id of new Set(ids)) {
    const url = await getMediaUrl(id);
    if (url) out = out.split(`src="fcp-media:${id}"`).join(`src="${url}" data-media-id="${id}"`);
  }
  return out;
}

function dehydrate(html: string): string {
  if (typeof document === 'undefined') return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll('img[data-media-id]').forEach((img) => {
    img.setAttribute('src', 'fcp-media:' + img.getAttribute('data-media-id'));
    img.removeAttribute('data-media-id');
  });
  let s = tpl.innerHTML;
  if (s === '<p></p>') s = '';
  return sanitize(s);
}

export function RichField({
  value,
  onChange,
  placeholder,
  cloze = false,
  autoFocus = false,
  minimal = false,
  ariaLabel,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  cloze?: boolean;
  autoFocus?: boolean;
  minimal?: boolean;
  ariaLabel: string;
}) {
  const t = useT();
  const [ready, setReady] = useState(false);
  const last = useRef(value);
  const fileRef = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, link: { openOnClick: false } }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      MediaImage.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder || '' }),
    ],
    content: '',
    editorProps: { attributes: { class: 'rich-input', 'aria-label': ariaLabel, role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor }) => {
      const html = dehydrate(editor.getHTML());
      last.current = html;
      onChange(html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    let alive = true;
    if (!ready || value !== last.current) {
      hydrate(value || '').then((h) => {
        if (!alive) return;
        editor.commands.setContent(h, { emitUpdate: false });
        last.current = value;
        setReady(true);
        if (autoFocus) editor.commands.focus('end');
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  async function insertImage(file: File) {
    if (!editor) return;
    const meta = await addImageMedia(file, file.name);
    const url = await getMediaUrl(meta.id);
    if (!url) return;
    editor.chain().focus().setImage({ src: url, 'data-media-id': meta.id } as any).run();
  }

  function makeCloze(ed: Editor, sameNumber: boolean) {
    const { from, to } = ed.state.selection;
    const text = ed.state.doc.textBetween(from, to, ' ');
    const current = dehydrate(ed.getHTML());
    let n = nextClozeNumber(current);
    if (sameNumber && n > 1) n -= 1;
    if (!text) {
      ed.chain().focus().insertContent(`{{c${n}::}}`).run();
      const pos = ed.state.selection.from - 2;
      ed.commands.setTextSelection(pos);
      return;
    }
    ed.chain().focus().insertContentAt({ from, to }, `{{c${n}::${text.replace(/</g, '&lt;')}}}`).run();
  }

  useEffect(() => {
    if (!editor || !cloze) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        makeCloze(editor, e.altKey);
      }
    };
    const dom = editor.view.dom;
    dom.addEventListener('keydown', handler);
    return () => dom.removeEventListener('keydown', handler);
  }, [editor, cloze]);

  if (!editor) return <div className="rich-field is-loading" />;
  const showPreview = hasMath(value);

  return (
    <div className={'rich-field' + (minimal ? ' is-minimal' : '')}>
      <div className="rich-toolbar" role="toolbar" aria-label={t('Text formatting')} onMouseDown={(e) => (e.target as HTMLElement).closest('button') && e.preventDefault()}>
        <IconButton label={t('Bold') + ' (Ctrl+B)'} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={16} />
        </IconButton>
        <IconButton label={t('Italic') + ' (Ctrl+I)'} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={16} />
        </IconButton>
        <IconButton label={t('Underline') + ' (Ctrl+U)'} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UIcon size={16} />
        </IconButton>
        {!minimal && (
          <IconButton label={t('Strikethrough')} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough size={16} />
          </IconButton>
        )}
        <Menu>
          <Tooltip text={t('Highlight')}>
            <MenuTrigger asChild>
              <button className="icon-btn" aria-label={t('Highlight')}>
                <Highlighter size={16} />
              </button>
            </MenuTrigger>
          </Tooltip>
          <MenuContent align="start">
            {HIGHLIGHTS.map((h) => (
              <MenuItem key={h.color} icon={<span className="swatch" style={{ background: h.color }} />} onSelect={() => editor.chain().focus().toggleHighlight({ color: h.color }).run()}>
                {t(h.name)}
              </MenuItem>
            ))}
            <MenuItem icon={<RemoveFormatting size={15} />} onSelect={() => editor.chain().focus().unsetHighlight().run()}>
              {t('No highlight')}
            </MenuItem>
          </MenuContent>
        </Menu>
        <Menu>
          <Tooltip text={t('Text color')}>
            <MenuTrigger asChild>
              <button className="icon-btn" aria-label={t('Text color')}>
                <Baseline size={16} />
              </button>
            </MenuTrigger>
          </Tooltip>
          <MenuContent align="start">
            {TEXT_COLORS.map((c) => (
              <MenuItem
                key={c.name}
                icon={<span className="swatch" style={{ background: c.color || 'var(--ink)' }} />}
                onSelect={() => (c.color ? editor.chain().focus().setColor(c.color).run() : editor.chain().focus().unsetColor().run())}
              >
                {t(c.name)}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
        {!minimal && (
          <>
            <span className="toolbar-sep" />
            <IconButton label={t('Bulleted list')} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List size={16} />
            </IconButton>
            <IconButton label={t('Numbered list')} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered size={16} />
            </IconButton>
          </>
        )}
        <span className="toolbar-sep" />
        <IconButton
          label={t('Insert formula')}
          onClick={() => {
            const { from, to } = editor.state.selection;
            const sel = editor.state.doc.textBetween(from, to, ' ');
            if (sel) editor.chain().focus().insertContentAt({ from, to }, `$${sel}$`).run();
            else {
              editor.chain().focus().insertContent('$x^2$').run();
              const p = editor.state.selection.from;
              editor.commands.setTextSelection({ from: p - 4, to: p - 1 });
            }
          }}
        >
          <Sigma size={16} />
        </IconButton>
        {!minimal && (
          <IconButton label={t('Insert image')} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={16} />
          </IconButton>
        )}
        {cloze && (
          <Tooltip text={t('Make a blank from the selected words (Ctrl+Shift+C)')}>
            <button className="btn btn-sm btn-cloze" onClick={() => makeCloze(editor, false)}>
              <Brackets size={15} />
              <span>{t('Make blank')}</span>
            </button>
          </Tooltip>
        )}
        <span className="toolbar-flex" />
        <IconButton label={t('Clear formatting')} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting size={16} />
        </IconButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) insertImage(f);
            e.target.value = '';
          }}
        />
      </div>
      <EditorContent
        editor={editor}
        onPaste={(e) => {
          const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
          if (f) {
            e.preventDefault();
            e.stopPropagation();
            insertImage(f).then(() => undefined);
          }
        }}
      />
      {showPreview && (
        <div className="math-preview" aria-live="polite">
          <span className="math-preview-label">{t('Preview')}</span>
          <RichHtml html={value} />
        </div>
      )}
    </div>
  );
}

export { primeMediaUrl };
