import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KImage, Rect, Ellipse, Line, Arrow, Text as KText, Transformer, Group } from 'react-konva';
import type Konva from 'konva';
import {
  MousePointer2,
  Square,
  Circle,
  Lasso,
  PenTool,
  Highlighter,
  MoveUpRight,
  Type,
  Eraser,
  Undo2,
  Redo2,
  Crop,
  RotateCw,
  RotateCcw,
  ScanText,
  Trash2,
  Copy,
  Check,
  X,
  ZoomIn,
  Palette,
  EyeOff,
  Eye,
  ChevronUp,
  ChevronDown,
  Wand2,
} from 'lucide-react';
import type { Annotation, Mask, NoteImage } from '../lib/types';
import { useMediaUrl, getMediaBlobAny, primeMediaUrl } from '../lib/media';
import { useStore, addMediaBlob } from '../lib/store';
import { rotateAndCrop, transformShapes } from '../lib/image';
import { uid } from '../lib/util';
import { useT } from '../lib/i18n';
import { Button, Dialog, IconButton, Popover, PopoverContent, PopoverTrigger, Segmented, Select, Slider, Tooltip, Menu, MenuTrigger, MenuContent, MenuItem, MenuSep } from './ui';
import { toast } from 'sonner';
import { recognize, type OcrResult } from '../lib/ocr';

type Tool = 'select' | 'rect' | 'ellipse' | 'lasso' | 'pen' | 'highlight' | 'arrow' | 'text' | 'eraser' | 'crop';

const DRAW_COLORS = ['#E5484D', '#2B55E6', '#0E9F9A', '#18213D', '#F2B705', '#7C4DDB', '#FFFFFF', '#16803C'];

interface Snapshot {
  masks: Mask[];
  annotations: Annotation[];
}

function useHtmlImage(url: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => {
      i.onload = null;
    };
  }, [url]);
  return img;
}

function simplify(points: number[], minDist: number): number[] {
  if (points.length <= 4) return points;
  const out = [points[0], points[1]];
  for (let i = 2; i < points.length; i += 2) {
    const dx = points[i] - out[out.length - 2];
    const dy = points[i + 1] - out[out.length - 1];
    if (dx * dx + dy * dy >= minDist * minDist) out.push(points[i], points[i + 1]);
  }
  return out;
}

function bbox(points: number[]) {
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export interface ImageEditorProps {
  image: NoteImage;
  onChange: (img: NoteImage) => void;
  focusMasks?: boolean;
}

export function ImageEditor({ image, onChange, focusMasks = true }: ImageEditorProps) {
  const t = useT();
  const url = useMediaUrl(image.mediaId);
  const htmlImg = useHtmlImage(url);
  const maskColor = useStore((s) => s.lib.settings.maskColor);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [boxW, setBoxW] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>(focusMasks ? 'rect' : 'pen');
  const [color, setColor] = useState('#E5484D');
  const [size, setSize] = useState(4);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ kind: Tool; points: number[]; x: number; y: number; w: number; h: number } | null>(null);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropAspect, setCropAspect] = useState('free');
  const [busy, setBusy] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [peek, setPeek] = useState(false);
  const drawing = useRef(false);

  const W = image.width;
  const H = image.height;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const maxH = typeof window !== 'undefined' ? Math.max(280, Math.min(window.innerHeight * 0.66, 760)) : 600;
  const fit = Math.min(boxW / W, maxH / H);
  const scale = fit * zoom;
  const unit = Math.max(W, H) / 800;

  const commit = useCallback(
    (next: Partial<Snapshot>) => {
      setPast((p) => [...p.slice(-60), { masks: image.masks, annotations: image.annotations }]);
      setFuture([]);
      onChange({ ...image, ...next });
    },
    [image, onChange],
  );

  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([{ masks: image.masks, annotations: image.annotations }, ...future]);
    onChange({ ...image, ...prev });
    setSelected(null);
  };
  const redo = () => {
    const nxt = future[0];
    if (!nxt) return;
    setFuture(future.slice(1));
    setPast([...past, { masks: image.masks, annotations: image.annotations }]);
    onChange({ ...image, ...nxt });
  };

  const nextGroup = () => (image.masks.length ? Math.max(...image.masks.map((m) => m.group)) + 1 : 1);

  const selMask = image.masks.find((m) => m.id === selected) || null;
  const selAnn = image.annotations.find((a) => a.id === selected) || null;

  // Transformer follows the selected shape.
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const id = tool === 'crop' ? 'crop-box' : selected;
    const node = id && (tool === 'select' || tool === 'crop') ? stage.findOne('#' + CSS.escape(id)) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selected, tool, image, crop]);

  function removeSelected() {
    if (!selected) return;
    commit({ masks: image.masks.filter((m) => m.id !== selected), annotations: image.annotations.filter((a) => a.id !== selected) });
    setSelected(null);
  }

  function duplicateSelected() {
    const off = 20 * unit;
    if (selMask) {
      const m: Mask = { ...selMask, id: uid(), x: selMask.x + off, y: selMask.y + off, points: selMask.points?.map((v) => v + off), group: nextGroup() };
      commit({ masks: [...image.masks, m] });
      setSelected(m.id);
    } else if (selAnn) {
      const a: Annotation = { ...selAnn, id: uid(), x: selAnn.x != null ? selAnn.x + off : undefined, y: selAnn.y != null ? selAnn.y + off : undefined, points: selAnn.points?.map((v) => v + off) };
      commit({ annotations: [...image.annotations, a] });
      setSelected(a.id);
    }
  }

  function nudge(dx: number, dy: number) {
    if (selMask) commit({ masks: image.masks.map((m) => (m.id === selMask.id ? { ...m, x: m.x + dx, y: m.y + dy, points: m.points?.map((v, i) => v + (i % 2 ? dy : dx)) } : m)) });
    if (selAnn)
      commit({
        annotations: image.annotations.map((a) => (a.id === selAnn.id ? { ...a, x: a.x != null ? a.x + dx : a.x, y: a.y != null ? a.y + dy : a.y, points: a.points?.map((v, i) => v + (i % 2 ? dy : dx)) } : a)),
      });
  }

  // Keyboard shortcuts while the editor is on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"], [role="dialog"] .rich-field')) return;
      if (!wrapRef.current?.isConnected) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        removeSelected();
        return;
      }
      if (e.key === 'Escape') {
        if (tool === 'crop') {
          setTool('select');
          setCrop(null);
        }
        setSelected(null);
        return;
      }
      if (e.key.startsWith('Arrow') && selected) {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * unit;
        nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
        return;
      }
      const map: Record<string, Tool> = { v: 'select', r: 'rect', e: 'ellipse', l: 'lasso', b: 'pen', h: 'highlight', a: 'arrow', t: 'text', x: 'eraser' };
      const nt = map[e.key.toLowerCase()];
      if (nt) {
        setTool(nt);
        if (nt !== 'select') setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function pointer(): { x: number; y: number } | null {
    const st = stageRef.current;
    const p = st?.getPointerPosition();
    if (!p) return null;
    return { x: Math.max(0, Math.min(W, p.x / scale)), y: Math.max(0, Math.min(H, p.y / scale)) };
  }

  function onDown(e: Konva.KonvaEventObject<PointerEvent>) {
    if (tool === 'crop') return;
    const p = pointer();
    if (!p) return;
    if (tool === 'select' || tool === 'eraser') {
      if (e.target === e.target.getStage() || e.target.name() === 'bg') setSelected(null);
      return;
    }
    if (tool === 'text') {
      const a: Annotation = { id: uid(), kind: 'text', x: p.x, y: p.y, text: t('Label'), color, size: Math.max(3, size) };
      commit({ annotations: [...image.annotations, a] });
      setTool('select');
      setSelected(a.id);
      setTimeout(() => document.getElementById('ann-text-input')?.focus(), 50);
      return;
    }
    drawing.current = true;
    setDraft({ kind: tool, points: [p.x, p.y], x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onMove() {
    if (!drawing.current || !draft) return;
    const p = pointer();
    if (!p) return;
    if (draft.kind === 'rect' || draft.kind === 'ellipse') {
      setDraft({ ...draft, w: p.x - draft.x, h: p.y - draft.y });
    } else if (draft.kind === 'arrow') {
      setDraft({ ...draft, points: [draft.points[0], draft.points[1], p.x, p.y] });
    } else {
      setDraft({ ...draft, points: [...draft.points, p.x, p.y] });
    }
  }

  function onUp() {
    if (!drawing.current || !draft) return;
    drawing.current = false;
    const d = draft;
    setDraft(null);
    const min = 6 * unit;
    if (d.kind === 'rect' || d.kind === 'ellipse') {
      const x = Math.min(d.x, d.x + d.w);
      const y = Math.min(d.y, d.y + d.h);
      const w = Math.abs(d.w);
      const h = Math.abs(d.h);
      if (w < min || h < min) return;
      const m: Mask = { id: uid(), kind: d.kind, x, y, w, h, label: '', group: nextGroup() };
      commit({ masks: [...image.masks, m] });
      setSelected(m.id);
      setTimeout(() => document.getElementById('mask-label-' + m.id)?.focus({ preventScroll: true }), 60);
    } else if (d.kind === 'lasso') {
      const pts = simplify(d.points, 3 * unit);
      if (pts.length < 6) return;
      const b = bbox(pts);
      if (b.w < min || b.h < min) return;
      const m: Mask = { id: uid(), kind: 'polygon', ...b, points: pts, label: '', group: nextGroup() };
      commit({ masks: [...image.masks, m] });
      setSelected(m.id);
      setTimeout(() => document.getElementById('mask-label-' + m.id)?.focus({ preventScroll: true }), 60);
    } else if (d.kind === 'arrow') {
      const [x1, y1, x2, y2] = d.points;
      if (x2 === undefined || Math.hypot(x2 - x1, y2 - y1) < min) return;
      commit({ annotations: [...image.annotations, { id: uid(), kind: 'arrow', points: d.points, color, size }] });
    } else if (d.kind === 'pen' || d.kind === 'highlight') {
      const pts = simplify(d.points, 1.5 * unit);
      if (pts.length < 4) return;
      commit({ annotations: [...image.annotations, { id: uid(), kind: d.kind, points: pts, color: d.kind === 'highlight' ? (color === '#FFFFFF' ? '#FFE14D' : color) : color, size }] });
    }
  }

  function onShapeClick(id: string) {
    if (tool === 'eraser') {
      commit({ masks: image.masks.filter((m) => m.id !== id), annotations: image.annotations.filter((a) => a.id !== id) });
      return;
    }
    if (tool === 'select') setSelected(id);
  }

  function bakeNode(id: string, node: Konva.Node) {
    const sx = node.scaleX();
    const sy = node.scaleY();
    const nx = node.x();
    const ny = node.y();
    const m = image.masks.find((mm) => mm.id === id);
    const a = image.annotations.find((aa) => aa.id === id);
    if (m) {
      let nm: Mask;
      if (m.kind === 'rect') nm = { ...m, x: nx, y: ny, w: Math.max(4, m.w * sx), h: Math.max(4, m.h * sy) };
      else if (m.kind === 'ellipse') {
        const w = Math.max(4, m.w * sx);
        const h = Math.max(4, m.h * sy);
        nm = { ...m, x: nx - w / 2, y: ny - h / 2, w, h };
      } else {
        const pts = (m.points || []).map((v, i) => (i % 2 ? v * sy + ny : v * sx + nx));
        nm = { ...m, ...bbox(pts), points: pts };
      }
      node.scaleX(1);
      node.scaleY(1);
      if (m.kind !== 'rect' && m.kind !== 'ellipse') node.position({ x: 0, y: 0 });
      commit({ masks: image.masks.map((mm) => (mm.id === id ? nm : mm)) });
    } else if (a) {
      let na: Annotation;
      if (a.kind === 'box') na = { ...a, x: nx, y: ny, w: (a.w || 0) * sx, h: (a.h || 0) * sy };
      else if (a.kind === 'text') na = { ...a, x: nx, y: ny, size: Math.max(2, a.size * Math.max(sx, sy)) };
      else na = { ...a, points: (a.points || []).map((v, i) => (i % 2 ? v * sy + ny : v * sx + nx)) };
      node.scaleX(1);
      node.scaleY(1);
      if (a.kind !== 'box' && a.kind !== 'text') node.position({ x: 0, y: 0 });
      commit({ annotations: image.annotations.map((aa) => (aa.id === id ? na : aa)) });
    }
  }

  // ---------- crop & rotate ----------
  function startCrop() {
    setSelected(null);
    setTool('crop');
    setCrop({ x: W * 0.05, y: H * 0.05, w: W * 0.9, h: H * 0.9 });
  }

  async function applyTransform(quarterTurns: number, box: { x: number; y: number; w: number; h: number } | null) {
    setBusy(true);
    try {
      const blob = await getMediaBlobAny(image.mediaId);
      if (!blob) throw new Error(t('The photo is not available yet.'));
      const cropBox = box ? { x: box.x, y: box.y, width: box.w, height: box.h } : null;
      const out = await rotateAndCrop(blob, quarterTurns, cropBox);
      const meta = await addMediaBlob(out.blob, { width: out.width, height: out.height });
      primeMediaUrl(meta.id, out.blob);
      const shapes = transformShapes(image.masks, image.annotations, quarterTurns, W, H, cropBox);
      setPast((p) => [...p, { masks: image.masks, annotations: image.annotations }]);
      setFuture([]);
      onChange({ ...image, mediaId: meta.id, width: out.width, height: out.height, ...shapes });
      // Older snapshots point at the old photo size, so undo history restarts here.
      setPast([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setTool('select');
      setCrop(null);
    }
  }

  const aspectRatio = cropAspect === 'free' ? 0 : (() => {
    const [a, b] = cropAspect.split(':').map(Number);
    return a / b;
  })();

  // Picking a crop shape resizes the crop box to the largest box of that shape.
  useEffect(() => {
    if (tool !== 'crop' || !aspectRatio) return;
    let w = W * 0.9;
    let h = w / aspectRatio;
    if (h > H * 0.9) {
      h = H * 0.9;
      w = h * aspectRatio;
    }
    setCrop({ x: (W - w) / 2, y: (H - h) / 2, w, h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropAspect]);

  // ---------- OCR to masks ----------
  function addOcrMasks(boxes: { text: string; x: number; y: number; w: number; h: number }[]) {
    let g = nextGroup();
    const fresh: Mask[] = boxes.map((b) => ({ id: uid(), kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, label: b.text, group: g++ }));
    commit({ masks: [...image.masks, ...fresh] });
    toast.success(t('Added {n} masks from the text in this photo.', { n: fresh.length }));
  }

  const stageW = Math.round(W * scale);
  const stageH = Math.round(H * scale);
  const cursor = tool === 'select' ? 'default' : tool === 'eraser' ? 'not-allowed' : tool === 'text' ? 'text' : 'crosshair';
  const maskOrder = useMemo(() => [...image.masks].sort((a, b) => a.group - b.group), [image.masks]);
  const groups = useMemo(() => [...new Set(image.masks.map((m) => m.group))].sort((a, b) => a - b), [image.masks]);

  const toolOptions = [
    { value: 'select', label: '', icon: <MousePointer2 size={17} />, tip: t('Select and move') + ' (V)' },
    { value: 'rect', label: '', icon: <Square size={17} />, tip: t('Hide with a box') + ' (R)' },
    { value: 'ellipse', label: '', icon: <Circle size={17} />, tip: t('Hide with an oval') + ' (E)' },
    { value: 'lasso', label: '', icon: <Lasso size={17} />, tip: t('Hide any shape (lasso)') + ' (L)' },
    { value: 'pen', label: '', icon: <PenTool size={17} />, tip: t('Pen') + ' (B)' },
    { value: 'highlight', label: '', icon: <Highlighter size={17} />, tip: t('Highlighter') + ' (H)' },
    { value: 'arrow', label: '', icon: <MoveUpRight size={17} />, tip: t('Arrow') + ' (A)' },
    { value: 'text', label: '', icon: <Type size={17} />, tip: t('Text') + ' (T)' },
    { value: 'eraser', label: '', icon: <Eraser size={17} />, tip: t('Erase a shape') + ' (X)' },
  ];

  return (
    <div className="img-editor">
      <div className="img-toolbar" role="toolbar" aria-label={t('Photo tools')}>
        {tool === 'crop' ? (
          <div className="img-cropbar">
            <Crop size={17} />
            <span>{t('Drag the corners to crop')}</span>
            <Select
              size="sm"
              value={cropAspect}
              onChange={setCropAspect}
              label={t('Crop shape')}
              options={[
                { value: 'free', label: t('Free') },
                { value: '1:1', label: t('Square') },
                { value: '4:3', label: '4:3' },
                { value: '3:4', label: '3:4' },
                { value: '16:9', label: '16:9' },
              ]}
            />
            <span className="toolbar-flex" />
            <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={() => (setTool('select'), setCrop(null))}>
              {t('Cancel')}
            </Button>
            <Button size="sm" variant="primary" icon={<Check size={15} />} disabled={busy} onClick={() => applyTransform(0, crop)}>
              {t('Apply crop')}
            </Button>
          </div>
        ) : (
          <>
            <div className="tool-group" role="radiogroup" aria-label={t('Drawing tool')}>
              {toolOptions.map((o, i) => (
                <span key={o.value} className={'tool-slot' + (i === 1 || i === 4 ? ' tool-gap' : '')}>
                  <IconButton label={o.tip} active={tool === o.value} role="radio" aria-checked={tool === o.value} onClick={() => (setTool(o.value as Tool), o.value !== 'select' && setSelected(null))}>
                    {o.icon}
                  </IconButton>
                </span>
              ))}
            </div>
            <span className="toolbar-sep" />
            <Popover>
              <Tooltip text={t('Pen color and size')}>
                <PopoverTrigger asChild>
                  <button className="icon-btn color-btn" aria-label={t('Pen color and size')}>
                    <Palette size={17} />
                    <span className="color-btn-dot" style={{ background: color }} />
                  </button>
                </PopoverTrigger>
              </Tooltip>
              <PopoverContent className="color-pop">
                <div className="swatch-grid">
                  {DRAW_COLORS.map((c) => (
                    <button
                      key={c}
                      className={'swatch-btn' + (c === color ? ' is-on' : '')}
                      style={{ background: c }}
                      aria-label={c}
                      onClick={() => {
                        setColor(c);
                        if (selAnn) commit({ annotations: image.annotations.map((a) => (a.id === selAnn.id ? { ...a, color: c } : a)) });
                      }}
                    />
                  ))}
                  <label className="swatch-btn swatch-custom" aria-label={t('Custom color')}>
                    <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                  </label>
                </div>
                <div className="pop-row">
                  <span>{t('Size')}</span>
                  <Slider value={size} min={1} max={16} onChange={setSize} label={t('Size')} />
                  <b>{size}</b>
                </div>
              </PopoverContent>
            </Popover>
            <IconButton label={t('Undo') + ' (Ctrl+Z)'} onClick={undo} disabled={!past.length}>
              <Undo2 size={17} />
            </IconButton>
            <IconButton label={t('Redo') + ' (Ctrl+Y)'} onClick={redo} disabled={!future.length}>
              <Redo2 size={17} />
            </IconButton>
            <span className="toolbar-sep" />
            <IconButton label={t('Crop')} onClick={startCrop} disabled={busy}>
              <Crop size={17} />
            </IconButton>
            <IconButton label={t('Rotate left')} onClick={() => applyTransform(3, null)} disabled={busy}>
              <RotateCcw size={17} />
            </IconButton>
            <IconButton label={t('Rotate right')} onClick={() => applyTransform(1, null)} disabled={busy}>
              <RotateCw size={17} />
            </IconButton>
            <IconButton label={t('Read text from photo (OCR)')} onClick={() => setOcrOpen(true)}>
              <ScanText size={17} />
            </IconButton>
            <span className="toolbar-flex" />
            {image.masks.length > 0 && (
              <IconButton label={peek ? t('Show masks') : t('Peek under masks')} active={peek} onClick={() => setPeek(!peek)}>
                {peek ? <Eye size={17} /> : <EyeOff size={17} />}
              </IconButton>
            )}
            <Menu>
              <Tooltip text={t('Zoom')}>
                <MenuTrigger asChild>
                  <button className="btn btn-ghost btn-sm" aria-label={t('Zoom')}>
                    <ZoomIn size={16} />
                    <span>{Math.round(zoom * 100)}%</span>
                  </button>
                </MenuTrigger>
              </Tooltip>
              <MenuContent>
                {[1, 1.5, 2, 3].map((z) => (
                  <MenuItem key={z} onSelect={() => setZoom(z)} icon={zoom === z ? <Check size={15} /> : null}>
                    {z === 1 ? t('Fit to screen') : `${z * 100}%`}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </>
        )}
      </div>

      <div className="img-stage-wrap" ref={wrapRef} style={{ maxHeight: zoom > 1 ? maxH + 40 : undefined }}>
        <div className="img-stage" style={{ width: stageW, height: stageH, cursor, touchAction: tool === 'select' ? 'pan-x pan-y' : 'none' }}>
          <Stage
            ref={stageRef}
            width={stageW}
            height={stageH}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
          >
            <Layer scaleX={scale} scaleY={scale}>
              {htmlImg && <KImage image={htmlImg} width={W} height={H} name="bg" />}
              {!htmlImg && <Rect width={W} height={H} fill="#E3ECF7" name="bg" />}
              {image.annotations.map((a) => (
                <AnnotationNode key={a.id} a={a} unit={unit} draggable={tool === 'select'} onSelect={() => onShapeClick(a.id)} onDone={(node) => bakeNode(a.id, node)} />
              ))}
              {!peek &&
                maskOrder.map((m) => (
                  <MaskNode
                    key={m.id}
                    m={m}
                    unit={unit}
                    color={maskColor}
                    selected={selected === m.id}
                    draggable={tool === 'select'}
                    onSelect={() => onShapeClick(m.id)}
                    onDone={(node) => bakeNode(m.id, node)}
                  />
                ))}
              {draft && <DraftNode d={draft} color={draft.kind === 'pen' || draft.kind === 'highlight' || draft.kind === 'arrow' ? color : maskColor} size={size} unit={unit} />}
              {tool === 'crop' && crop && (
                <>
                  <Rect x={0} y={0} width={W} height={H} fill="rgba(10,16,34,.45)" listening={false} />
                  <Rect
                    id="crop-box"
                    x={crop.x}
                    y={crop.y}
                    width={crop.w}
                    height={crop.h}
                    fill="rgba(255,255,255,.08)"
                    stroke="#fff"
                    strokeWidth={2 / scale}
                    dash={[8 / scale, 6 / scale]}
                    draggable
                    dragBoundFunc={(pos) => ({ x: Math.max(0, Math.min(pos.x, (W - crop.w) * scale)), y: Math.max(0, Math.min(pos.y, (H - crop.h) * scale)) })}
                    onDragEnd={(e) => setCrop({ ...crop, x: e.target.x(), y: e.target.y() })}
                    onTransformEnd={(e) => {
                      const n = e.target;
                      const nw = Math.min(W, crop.w * n.scaleX());
                      const nh = Math.min(H, crop.h * n.scaleY());
                      n.scaleX(1);
                      n.scaleY(1);
                      setCrop({ x: Math.max(0, n.x()), y: Math.max(0, n.y()), w: nw, h: nh });
                    }}
                  />
                </>
              )}
              <Transformer
                ref={trRef}
                rotateEnabled={false}
                keepRatio={tool === 'crop' ? aspectRatio > 0 : false}
                flipEnabled={false}
                anchorSize={12}
                anchorCornerRadius={6}
                borderStroke="#2B55E6"
                anchorStroke="#2B55E6"
                anchorFill="#fff"
                ignoreStroke
                boundBoxFunc={(oldB, newB) => (newB.width < 8 || newB.height < 8 ? oldB : newB)}
              />
            </Layer>
          </Stage>
        </div>
      </div>

      <div className="img-side">
        {selAnn && (
          <div className="img-prop">
            {selAnn.kind === 'text' && (
              <textarea
                id="ann-text-input"
                className="input"
                rows={2}
                value={selAnn.text}
                aria-label={t('Text on photo')}
                onChange={(e) => onChange({ ...image, annotations: image.annotations.map((a) => (a.id === selAnn.id ? { ...a, text: e.target.value } : a)) })}
              />
            )}
            <div className="img-prop-row">
              <span className="swatch" style={{ background: selAnn.color }} />
              <span className="muted">{t('Drawing selected')}</span>
              <span className="toolbar-flex" />
              <IconButton label={t('Duplicate') + ' (Ctrl+D)'} onClick={duplicateSelected}>
                <Copy size={16} />
              </IconButton>
              <IconButton label={t('Delete') + ' (Del)'} onClick={removeSelected}>
                <Trash2 size={16} />
              </IconButton>
            </div>
          </div>
        )}
        {focusMasks && (
          <div className="mask-panel">
            <div className="mask-panel-head">
              <h4>
                {t('Hidden parts')} <span className="count">{image.masks.length}</span>
              </h4>
              <Segmented
                size="sm"
                value={image.occlusionMode}
                onChange={(v) => onChange({ ...image, occlusionMode: v })}
                label={t('How masks show while studying')}
                options={[
                  { value: 'hideAll', label: t('Hide all, ask one') },
                  { value: 'hideOne', label: t('Hide one at a time') },
                ]}
              />
            </div>
            {image.masks.length === 0 ? (
              <p className="mask-empty">
                <Wand2 size={16} /> {t('Drag a box over any part of the photo to hide it. Each hidden part becomes its own card. Or use')}{' '}
                <button className="link" onClick={() => setOcrOpen(true)}>
                  {t('Read text from photo')}
                </button>{' '}
                {t('to hide every word automatically.')}
              </p>
            ) : (
              <ol className="mask-list">
                {maskOrder.map((m) => (
                  <li key={m.id} className={'mask-row' + (selected === m.id ? ' is-on' : '')} onClick={() => (setSelected(m.id), setTool('select'))}>
                    <span className="mask-num" style={{ background: maskColor }}>
                      {m.group}
                    </span>
                    <input
                      id={'mask-label-' + m.id}
                      className="input input-sm"
                      placeholder={t('Answer for this part (optional)')}
                      value={m.label}
                      onFocus={() => setSelected(m.id)}
                      onChange={(e) => onChange({ ...image, masks: image.masks.map((mm) => (mm.id === m.id ? { ...mm, label: e.target.value } : mm)) })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const idx = maskOrder.findIndex((x) => x.id === m.id);
                          const next = maskOrder[idx + 1];
                          if (next) document.getElementById('mask-label-' + next.id)?.focus();
                          else (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                    <Menu>
                      <MenuTrigger asChild>
                        <button className="btn btn-ghost btn-sm mask-group-btn" aria-label={t('Card group')} onClick={(e) => e.stopPropagation()}>
                          {t('Card {n}', { n: m.group })}
                          <ChevronDown size={14} />
                        </button>
                      </MenuTrigger>
                      <MenuContent>
                        {groups.map((g) => (
                          <MenuItem key={g} icon={g === m.group ? <Check size={15} /> : null} onSelect={() => commit({ masks: image.masks.map((mm) => (mm.id === m.id ? { ...mm, group: g } : mm)) })}>
                            {t('Same card as part {n}', { n: g })}
                          </MenuItem>
                        ))}
                        <MenuSep />
                        <MenuItem onSelect={() => commit({ masks: image.masks.map((mm) => (mm.id === m.id ? { ...mm, group: nextGroup() } : mm)) })}>{t('Its own card')}</MenuItem>
                      </MenuContent>
                    </Menu>
                    <IconButton
                      label={t('Move up')}
                      className="icon-btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        const prev = groups[groups.indexOf(m.group) - 1];
                        if (prev === undefined) return;
                        commit({ masks: image.masks.map((mm) => (mm.group === m.group ? { ...mm, group: prev } : mm.group === prev ? { ...mm, group: m.group } : mm)) });
                      }}
                    >
                      <ChevronUp size={15} />
                    </IconButton>
                    <IconButton
                      label={t('Delete')}
                      className="icon-btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        commit({ masks: image.masks.filter((mm) => mm.id !== m.id) });
                      }}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
      <OcrDialog open={ocrOpen} onOpenChange={setOcrOpen} mediaId={image.mediaId} onMasks={addOcrMasks} />
    </div>
  );
}

function MaskNode({
  m,
  unit,
  color,
  selected,
  draggable,
  onSelect,
  onDone,
}: {
  m: Mask;
  unit: number;
  color: string;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDone: (n: Konva.Node) => void;
}) {
  const common = {
    id: m.id,
    fill: color,
    opacity: 1,
    stroke: selected ? '#FFE14D' : '#ffffff',
    strokeWidth: (selected ? 4 : 2) * unit,
    draggable,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onDone(e.target),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => onDone(e.target),
  };
  const fs = Math.max(12 * unit, Math.min(m.h * 0.5, 28 * unit));
  return (
    <>
      {m.kind === 'rect' && <Rect {...common} x={m.x} y={m.y} width={m.w} height={m.h} cornerRadius={Math.min(6 * unit, m.w / 8, m.h / 8)} />}
      {m.kind === 'ellipse' && <Ellipse {...common} x={m.x + m.w / 2} y={m.y + m.h / 2} radiusX={m.w / 2} radiusY={m.h / 2} />}
      {m.kind === 'polygon' && <Line {...common} points={m.points || []} closed lineJoin="round" />}
      <Group listening={false}>
        <KText
          x={m.x}
          y={m.y}
          width={m.w}
          height={m.h}
          align="center"
          verticalAlign="middle"
          text={m.label ? m.label : String(m.group)}
          fontSize={m.label ? Math.min(fs, (m.w / Math.max(3, m.label.length)) * 1.7) : fs}
          fontStyle="bold"
          fill="#ffffff"
          ellipsis
          wrap="none"
        />
      </Group>
    </>
  );
}

function AnnotationNode({ a, unit, draggable, onSelect, onDone }: { a: Annotation; unit: number; draggable: boolean; onSelect: () => void; onDone: (n: Konva.Node) => void }) {
  const sw = a.size * unit;
  const ev = {
    id: a.id,
    draggable,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onDone(e.target),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => onDone(e.target),
    hitStrokeWidth: Math.max(14 * unit, sw * 2),
  };
  if (a.kind === 'pen') return <Line {...ev} points={a.points || []} stroke={a.color} strokeWidth={sw} lineCap="round" lineJoin="round" tension={0.3} />;
  if (a.kind === 'highlight') return <Line {...ev} points={a.points || []} stroke={a.color} strokeWidth={sw * 4} opacity={0.38} lineCap="butt" lineJoin="round" globalCompositeOperation="multiply" />;
  if (a.kind === 'arrow') return <Arrow {...ev} points={a.points || []} stroke={a.color} fill={a.color} strokeWidth={sw} pointerLength={Math.max(sw * 3.5, 10 * unit)} pointerWidth={Math.max(sw * 3, 9 * unit)} lineCap="round" />;
  if (a.kind === 'box') return <Rect {...ev} x={a.x} y={a.y} width={a.w} height={a.h} stroke={a.color} strokeWidth={sw} cornerRadius={4 * unit} />;
  if (a.kind === 'text') {
    const fs = a.size * 6 * unit;
    return <KText {...ev} x={a.x} y={a.y} text={a.text || ''} fontSize={fs} fontStyle="bold" fill={a.color} stroke="rgba(255,255,255,.85)" strokeWidth={fs * 0.12} fillAfterStrokeEnabled lineHeight={1.2} />;
  }
  return null;
}

function DraftNode({ d, color, size, unit }: { d: { kind: Tool; points: number[]; x: number; y: number; w: number; h: number }; color: string; size: number; unit: number }) {
  const sw = size * unit;
  if (d.kind === 'rect') return <Rect x={Math.min(d.x, d.x + d.w)} y={Math.min(d.y, d.y + d.h)} width={Math.abs(d.w)} height={Math.abs(d.h)} fill={color} opacity={0.6} stroke="#fff" strokeWidth={2 * unit} dash={[6 * unit, 4 * unit]} />;
  if (d.kind === 'ellipse') return <Ellipse x={d.x + d.w / 2} y={d.y + d.h / 2} radiusX={Math.abs(d.w / 2)} radiusY={Math.abs(d.h / 2)} fill={color} opacity={0.6} stroke="#fff" strokeWidth={2 * unit} />;
  if (d.kind === 'lasso') return <Line points={d.points} closed fill={color} opacity={0.5} stroke="#fff" strokeWidth={2 * unit} dash={[6 * unit, 4 * unit]} />;
  if (d.kind === 'arrow') return <Arrow points={d.points.length >= 4 ? d.points : [...d.points, ...d.points]} stroke={color} fill={color} strokeWidth={sw} pointerLength={Math.max(sw * 3.5, 10 * unit)} pointerWidth={Math.max(sw * 3, 9 * unit)} />;
  if (d.kind === 'highlight') return <Line points={d.points} stroke={color === '#FFFFFF' ? '#FFE14D' : color} strokeWidth={sw * 4} opacity={0.38} />;
  return <Line points={d.points} stroke={color} strokeWidth={sw} lineCap="round" lineJoin="round" tension={0.3} />;
}

function OcrDialog({ open, onOpenChange, mediaId, onMasks }: { open: boolean; onOpenChange: (v: boolean) => void; mediaId: string; onMasks: (b: { text: string; x: number; y: number; w: number; h: number }[]) => void }) {
  const t = useT();
  const [lang, setLang] = useState('eng');
  const [progress, setProgress] = useState<{ p: number; status: string } | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setResult(null);
      setProgress(null);
      setError('');
    }
  }, [open, mediaId]);

  async function run() {
    setError('');
    setResult(null);
    setProgress({ p: 0, status: 'loading' });
    try {
      const blob = await getMediaBlobAny(mediaId);
      if (!blob) throw new Error(t('The photo is not available yet.'));
      const r = await recognize(blob, lang, (p, status) => setProgress({ p, status }));
      setResult(r);
    } catch (e) {
      setError((e as Error).message || t('Text reading failed. Check your internet connection and try again.'));
    } finally {
      setProgress(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Read text from photo')}
      description={t('Finds printed or clear handwritten text, then hides each word or line for you. Runs in your browser; the first run downloads the reading model.')}
      size="md"
      footer={
        result ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                navigator.clipboard?.writeText(result.text);
                toast.success(t('Text copied'));
              }}
            >
              {t('Copy text')}
            </Button>
            <Button
              onClick={() => {
                onMasks(result.lines);
                onOpenChange(false);
              }}
              disabled={!result.lines.length}
            >
              {t('Hide each line ({n})', { n: result.lines.length })}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onMasks(result.words);
                onOpenChange(false);
              }}
              disabled={!result.words.length}
            >
              {t('Hide each word ({n})', { n: result.words.length })}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={run} disabled={!!progress} icon={<ScanText size={16} />}>
            {progress ? t('Reading...') : t('Read text')}
          </Button>
        )
      }
    >
      <div className="field">
        <label className="field-label">{t('Language in the photo')}</label>
        <Select
          value={lang}
          onChange={setLang}
          label={t('Language in the photo')}
          options={[
            { value: 'eng', label: 'English' },
            { value: 'hin', label: 'हिन्दी (Hindi)' },
            { value: 'eng+hin', label: 'English + हिन्दी' },
          ]}
        />
      </div>
      {progress && (
        <div className="ocr-progress">
          <div className="progress tone-ballpoint">
            <span style={{ width: `${Math.round(progress.p * 100)}%` }} />
          </div>
          <span className="muted">{progress.status.includes('recogniz') ? t('Reading text') : t('Getting ready')}</span>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      {result && (
        <div className="ocr-result">
          <p className="muted">{t('Found {w} words in {l} lines.', { w: result.words.length, l: result.lines.length })}</p>
          <pre className="ocr-text">{result.text.trim() || t('No text was found in this photo.')}</pre>
        </div>
      )}
    </Dialog>
  );
}
