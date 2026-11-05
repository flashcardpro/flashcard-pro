import type { Annotation, Mask, NoteImage } from '../lib/types';
import { useMediaUrl } from '../lib/media';
import { useStore } from '../lib/store';
import { ImageOff } from 'lucide-react';

export type MaskView =
  | { mode: 'none' } // just the photo + drawings
  | { mode: 'all' } // every mask hidden (editor preview, thumbnails)
  | { mode: 'question'; group: number } // studying: target highlighted
  | { mode: 'answer'; group: number }; // studying: target revealed

function maskPath(m: Mask) {
  if (m.kind === 'polygon' && m.points && m.points.length >= 6) {
    let d = `M${m.points[0]},${m.points[1]}`;
    for (let i = 2; i < m.points.length; i += 2) d += `L${m.points[i]},${m.points[i + 1]}`;
    return d + 'Z';
  }
  return '';
}

export function MaskShape({ m, fill, stroke, dashed, strokeWidth }: { m: Mask; fill: string; stroke: string; dashed?: boolean; strokeWidth: number }) {
  const common = { fill, stroke, strokeWidth, strokeDasharray: dashed ? `${strokeWidth * 3} ${strokeWidth * 2}` : undefined };
  if (m.kind === 'ellipse') return <ellipse cx={m.x + m.w / 2} cy={m.y + m.h / 2} rx={m.w / 2} ry={m.h / 2} {...common} />;
  if (m.kind === 'polygon') return <path d={maskPath(m)} {...common} strokeLinejoin="round" />;
  return <rect x={m.x} y={m.y} width={m.w} height={m.h} rx={Math.min(6, m.w / 8, m.h / 8)} {...common} />;
}

export function AnnotationShape({ a, unit }: { a: Annotation; unit: number }) {
  const sw = a.size * unit;
  if (a.kind === 'pen' || a.kind === 'highlight') {
    const pts = a.points || [];
    if (pts.length < 2) return null;
    let d = `M${pts[0]},${pts[1]}`;
    for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]},${pts[i + 1]}`;
    return (
      <path
        d={d}
        fill="none"
        stroke={a.color}
        strokeWidth={a.kind === 'highlight' ? sw * 4 : sw}
        strokeLinecap={a.kind === 'highlight' ? 'butt' : 'round'}
        strokeLinejoin="round"
        opacity={a.kind === 'highlight' ? 0.38 : 1}
        style={a.kind === 'highlight' ? { mixBlendMode: 'multiply' } : undefined}
      />
    );
  }
  if (a.kind === 'arrow') {
    const p = a.points || [];
    if (p.length < 4) return null;
    const [x1, y1, x2, y2] = p;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const head = Math.max(sw * 3.5, 10 * unit);
    const hx1 = x2 - head * Math.cos(ang - 0.45);
    const hy1 = y2 - head * Math.sin(ang - 0.45);
    const hx2 = x2 - head * Math.cos(ang + 0.45);
    const hy2 = y2 - head * Math.sin(ang + 0.45);
    return (
      <g stroke={a.color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill={a.color}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <path d={`M${x2},${y2}L${hx1},${hy1}L${hx2},${hy2}Z`} />
      </g>
    );
  }
  if (a.kind === 'box') {
    return <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="none" stroke={a.color} strokeWidth={sw} rx={4 * unit} />;
  }
  if (a.kind === 'text') {
    const fs = a.size * 6 * unit;
    return (
      <text
        x={a.x}
        y={(a.y || 0) + fs}
        fill={a.color}
        fontSize={fs}
        fontWeight={700}
        fontFamily="var(--font)"
        paintOrder="stroke"
        stroke="rgba(255,255,255,.85)"
        strokeWidth={fs * 0.18}
      >
        {(a.text || '').split('\n').map((line, i) => (
          <tspan key={i} x={a.x} dy={i === 0 ? 0 : fs * 1.2}>
            {line}
          </tspan>
        ))}
      </text>
    );
  }
  return null;
}

/** A photo with its drawings and hide-and-reveal masks, drawn as SVG on top. */
export function CardImage({ image, view, className = '', onMaskClick }: { image: NoteImage; view: MaskView; className?: string; onMaskClick?: (m: Mask) => void }) {
  const url = useMediaUrl(image.mediaId);
  const maskColor = useStore((s) => s.lib.settings.maskColor);
  const targetColor = useStore((s) => s.lib.settings.targetColor);
  const { width: w, height: h } = image;
  const unit = Math.max(w, h) / 800;
  const masks = image.masks;
  const visible: { m: Mask; role: 'other' | 'target' | 'revealed' }[] = [];
  if (view.mode === 'all') masks.forEach((m) => visible.push({ m, role: 'other' }));
  if (view.mode === 'question' || view.mode === 'answer') {
    for (const m of masks) {
      const isTarget = m.group === view.group;
      if (isTarget) visible.push({ m, role: view.mode === 'question' ? 'target' : 'revealed' });
      else if (image.occlusionMode === 'hideAll') visible.push({ m, role: 'other' });
    }
  }
  return (
    <div className={'card-image ' + className} style={{ aspectRatio: `${w} / ${h}`, ['--ar' as string]: w / h }}>
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : (
        <div className="card-image-missing">
          <ImageOff size={28} />
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="card-image-svg">
        {image.annotations.map((a) => (
          <AnnotationShape key={a.id} a={a} unit={unit} />
        ))}
        {visible.map(({ m, role }) => (
          <g key={m.id} className={'mask mask-' + role} onClick={onMaskClick ? () => onMaskClick(m) : undefined}>
            {role === 'revealed' ? (
              <MaskShape m={m} fill="rgba(14,159,154,.10)" stroke="#0E9F9A" strokeWidth={3 * unit} dashed />
            ) : (
              <>
                {role === 'target' && <MaskShape m={m} fill="none" stroke="#FFE14D" strokeWidth={6 * unit} />}
                <MaskShape m={m} fill={role === 'target' ? targetColor : maskColor} stroke="rgba(255,255,255,.9)" strokeWidth={2 * unit} />
              </>
            )}
            {role === 'target' && m.w > 24 * unit && m.h > 18 * unit && (
              <text x={m.x + m.w / 2} y={m.y + m.h / 2} textAnchor="middle" dominantBaseline="central" fill="#fff" fontWeight={800} fontSize={Math.min(m.h * 0.6, 34 * unit)} fontFamily="var(--font)">
                ?
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
