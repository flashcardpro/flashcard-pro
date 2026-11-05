import * as DM from '@radix-ui/react-dropdown-menu';
import * as CM from '@radix-ui/react-context-menu';
import * as Sel from '@radix-ui/react-select';
import * as Dlg from '@radix-ui/react-dialog';
import * as Tip from '@radix-ui/react-tooltip';
import * as Sw from '@radix-ui/react-switch';
import * as Sl from '@radix-ui/react-slider';
import * as Tg from '@radix-ui/react-toggle-group';
import * as Pop from '@radix-ui/react-popover';
import * as HC from '@radix-ui/react-hover-card';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { CardStatus, DeckColor } from '../lib/types';
import { useT } from '../lib/i18n';

// ---------- buttons ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'secondary', size = 'md', icon, className = '', children, ...rest }, ref) {
  return (
    <button ref={ref} className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
      {icon}
      {children != null && children !== false && <span className="btn-label">{children}</span>}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tip?: boolean; active?: boolean }>(function IconButton(
  { label, tip = true, active, className = '', children, ...rest },
  ref,
) {
  const btn = (
    <button ref={ref} aria-label={label} aria-pressed={active} className={`icon-btn ${active ? 'is-active' : ''} ${className}`} {...rest}>
      {children}
    </button>
  );
  return tip ? <Tooltip text={label}>{btn}</Tooltip> : btn;
});

// ---------- tooltip ----------
export function Tooltip({ text, children, side = 'bottom' }: { text: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tip.Root delayDuration={350}>
      <Tip.Trigger asChild>{children}</Tip.Trigger>
      <Tip.Portal>
        <Tip.Content className="tooltip" side={side} sideOffset={6}>
          {text}
        </Tip.Content>
      </Tip.Portal>
    </Tip.Root>
  );
}

export const TooltipProvider = Tip.Provider;

// ---------- dropdown menu ----------
export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({ children, align = 'end', className = '', side }: { children: ReactNode; align?: 'start' | 'center' | 'end'; className?: string; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <DM.Portal>
      <DM.Content className={'menu ' + className} align={align} side={side} sideOffset={6} collisionPadding={10} loop>
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

interface ItemProps {
  icon?: ReactNode;
  children: ReactNode;
  shortcut?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
}

export function MenuItem({ icon, children, shortcut, onSelect, danger, disabled, hint }: ItemProps) {
  return (
    <DM.Item className={'menu-item' + (danger ? ' is-danger' : '')} onSelect={onSelect} disabled={disabled}>
      <span className="menu-icon">{icon}</span>
      <span className="menu-text">
        {children}
        {hint && <span className="menu-hint">{hint}</span>}
      </span>
      {shortcut && <kbd className="menu-kbd">{shortcut}</kbd>}
    </DM.Item>
  );
}

export function MenuCheck({ checked, onChange, children, icon }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; icon?: ReactNode }) {
  return (
    <DM.CheckboxItem className="menu-item" checked={checked} onCheckedChange={(v) => onChange(!!v)} onSelect={(e) => e.preventDefault()}>
      <span className="menu-icon">
        <DM.ItemIndicator>
          <Check size={15} />
        </DM.ItemIndicator>
        {!checked && icon}
      </span>
      <span className="menu-text">{children}</span>
    </DM.CheckboxItem>
  );
}

export function MenuRadioGroup({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <DM.RadioGroup value={value} onValueChange={onChange}>
      {children}
    </DM.RadioGroup>
  );
}

export function MenuRadio({ value, children, swatch }: { value: string; children: ReactNode; swatch?: string }) {
  return (
    <DM.RadioItem className="menu-item" value={value}>
      <span className="menu-icon">
        {swatch ? <span className="swatch" style={{ background: swatch }} /> : null}
        <DM.ItemIndicator className={swatch ? 'menu-radio-on-swatch' : ''}>
          <Check size={15} />
        </DM.ItemIndicator>
      </span>
      <span className="menu-text">
        <span className="menu-label">{children}</span>
      </span>
    </DM.RadioItem>
  );
}

export function MenuSub({ icon, label, children }: { icon?: ReactNode; label: ReactNode; children: ReactNode }) {
  return (
    <DM.Sub>
      <DM.SubTrigger className="menu-item">
        <span className="menu-icon">{icon}</span>
        <span className="menu-text">{label}</span>
        <ChevronRight size={15} className="menu-chev" />
      </DM.SubTrigger>
      <DM.Portal>
        <DM.SubContent className="menu" sideOffset={4} collisionPadding={10}>
          {children}
        </DM.SubContent>
      </DM.Portal>
    </DM.Sub>
  );
}

export const MenuSep = () => <DM.Separator className="menu-sep" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => <DM.Label className="menu-label">{children}</DM.Label>;

// ---------- context menu (right click / long press) ----------
export const Ctx = CM.Root;
export const CtxTrigger = CM.Trigger;
export function CtxContent({ children }: { children: ReactNode }) {
  return (
    <CM.Portal>
      <CM.Content className="menu" collisionPadding={10} loop>
        {children}
      </CM.Content>
    </CM.Portal>
  );
}
export function CtxItem({ icon, children, shortcut, onSelect, danger, disabled, hint }: ItemProps) {
  return (
    <CM.Item className={'menu-item' + (danger ? ' is-danger' : '')} onSelect={onSelect} disabled={disabled}>
      <span className="menu-icon">{icon}</span>
      <span className="menu-text">
        {children}
        {hint && <span className="menu-hint">{hint}</span>}
      </span>
      {shortcut && <kbd className="menu-kbd">{shortcut}</kbd>}
    </CM.Item>
  );
}
export function CtxSub({ icon, label, children }: { icon?: ReactNode; label: ReactNode; children: ReactNode }) {
  return (
    <CM.Sub>
      <CM.SubTrigger className="menu-item">
        <span className="menu-icon">{icon}</span>
        <span className="menu-text">{label}</span>
        <ChevronRight size={15} className="menu-chev" />
      </CM.SubTrigger>
      <CM.Portal>
        <CM.SubContent className="menu" sideOffset={4} collisionPadding={10}>
          {children}
        </CM.SubContent>
      </CM.Portal>
    </CM.Sub>
  );
}
export const CtxSep = () => <CM.Separator className="menu-sep" />;

// ---------- select ----------
export interface Option {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  label,
  className = '',
  size = 'md',
  groups,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: Option[];
  groups?: { label: string; options: Option[] }[];
  placeholder?: string;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const renderItem = (o: Option) => (
    <Sel.Item key={o.value} value={o.value} className="select-item">
      {o.icon && <span className="select-icon">{o.icon}</span>}
      <Sel.ItemText>{o.label}</Sel.ItemText>
      {o.hint && <span className="select-hint">{o.hint}</span>}
      <Sel.ItemIndicator className="select-check">
        <Check size={15} />
      </Sel.ItemIndicator>
    </Sel.Item>
  );
  return (
    <Sel.Root value={value} onValueChange={onChange}>
      <Sel.Trigger className={`select-trigger select-${size} ${className}`} aria-label={label}>
        <Sel.Value placeholder={placeholder} />
        <Sel.Icon className="select-chev">
          <ChevronDown size={16} />
        </Sel.Icon>
      </Sel.Trigger>
      <Sel.Portal>
        <Sel.Content className="select-content" position="popper" sideOffset={6} collisionPadding={10}>
          <Sel.Viewport className="select-viewport">
            {options?.map(renderItem)}
            {groups?.map((g) => (
              <Sel.Group key={g.label}>
                <Sel.Label className="menu-label">{g.label}</Sel.Label>
                {g.options.map(renderItem)}
              </Sel.Group>
            ))}
          </Sel.Viewport>
        </Sel.Content>
      </Sel.Portal>
    </Sel.Root>
  );
}

// ---------- dialog ----------
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className = '',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}) {
  const t = useT();
  return (
    <Dlg.Root open={open} onOpenChange={onOpenChange}>
      <Dlg.Portal>
        <Dlg.Overlay className="dialog-overlay" />
        <Dlg.Content className={`dialog dialog-${size} ${className}`} aria-describedby={description ? undefined : undefined}>
          <header className="dialog-head">
            <Dlg.Title className="dialog-title">{title}</Dlg.Title>
            <Dlg.Close asChild>
              <button className="icon-btn" aria-label={t('Close')}>
                <X size={18} />
              </button>
            </Dlg.Close>
          </header>
          {description ? <Dlg.Description className="dialog-desc">{description}</Dlg.Description> : <Dlg.Description className="sr-only">{title}</Dlg.Description>}
          <div className="dialog-body">{children}</div>
          {footer && <footer className="dialog-foot">{footer}</footer>}
        </Dlg.Content>
      </Dlg.Portal>
    </Dlg.Root>
  );
}

/** Side sheet (mobile navigation drawer). */
export function Sheet({ open, onOpenChange, children, title }: { open: boolean; onOpenChange: (v: boolean) => void; children: ReactNode; title: string }) {
  return (
    <Dlg.Root open={open} onOpenChange={onOpenChange}>
      <Dlg.Portal>
        <Dlg.Overlay className="dialog-overlay" />
        <Dlg.Content className="sheet">
          <Dlg.Title className="sr-only">{title}</Dlg.Title>
          <Dlg.Description className="sr-only">{title}</Dlg.Description>
          {children}
        </Dlg.Content>
      </Dlg.Portal>
    </Dlg.Root>
  );
}

// ---------- switch / slider / segmented ----------
export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label?: string; id?: string }) {
  return (
    <Sw.Root className="switch" checked={checked} onCheckedChange={onChange} aria-label={label} id={id}>
      <Sw.Thumb className="switch-thumb" />
    </Sw.Root>
  );
}

export function Slider({ value, onChange, min, max, step = 1, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string }) {
  return (
    <Sl.Root className="slider" value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} aria-label={label}>
      <Sl.Track className="slider-track">
        <Sl.Range className="slider-range" />
      </Sl.Track>
      <Sl.Thumb className="slider-thumb" aria-label={label} />
    </Sl.Root>
  );
}

export function Segmented<V extends string>({ value, onChange, options, label, size = 'md' }: { value: V; onChange: (v: V) => void; options: Option[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <Tg.Root type="single" className={`seg seg-${size}`} value={value} onValueChange={(v) => v && onChange(v as V)} aria-label={label}>
      {options.map((o) => (
        <Tg.Item key={o.value} value={o.value} className="seg-item" aria-label={typeof o.label === 'string' ? o.label : o.value}>
          {o.icon}
          {o.label && <span>{o.label}</span>}
        </Tg.Item>
      ))}
    </Tg.Root>
  );
}

// ---------- popover / hover card ----------
export const Popover = Pop.Root;
export const PopoverTrigger = Pop.Trigger;
export function PopoverContent({ children, className = '', align = 'center', side }: { children: ReactNode; className?: string; align?: 'start' | 'center' | 'end'; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Pop.Portal>
      <Pop.Content className={'popover ' + className} align={align} side={side} sideOffset={8} collisionPadding={10}>
        {children}
      </Pop.Content>
    </Pop.Portal>
  );
}
export const PopoverClose = Pop.Close;

export function HoverCard({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <HC.Root openDelay={350} closeDelay={80}>
      <HC.Trigger asChild>{trigger}</HC.Trigger>
      <HC.Portal>
        <HC.Content className="hovercard" sideOffset={8} collisionPadding={10}>
          {children}
        </HC.Content>
      </HC.Portal>
    </HC.Root>
  );
}

// ---------- small bits ----------
export const STATUS_LABEL: Record<CardStatus, string> = {
  new: 'New',
  learning: 'Learning',
  due: 'Due',
  review: 'Reviewing',
  mastered: 'Mastered',
  suspended: 'Paused',
};

export function StatusPill({ status, count }: { status: CardStatus; count?: number }) {
  const t = useT();
  return (
    <span className={`pill status-${status}`}>
      <span className="pill-dot" />
      {t(STATUS_LABEL[status])}
      {count !== undefined && <b>{count}</b>}
    </span>
  );
}

export function DeckSwatch({ color, size = 12 }: { color: DeckColor; size?: number }) {
  return <span className={`deck-swatch deck-${color}`} style={{ width: size, height: size }} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3 className="empty-title">{title}</h3>
      {children && <p className="empty-text">{children}</p>}
      {action}
    </div>
  );
}

export function Progress({ value, tone = 'ballpoint', label }: { value: number; tone?: string; label?: string }) {
  return (
    <div className={`progress tone-${tone}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
