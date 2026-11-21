// Small building blocks shared by every screen.
import { CSSProperties, ReactElement, ReactNode, cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { CaretLeft, CaretRight, Check as CheckIcon, GearSix as Gear } from '@phosphor-icons/react';
import { Haptic, haptic, lowPerf, tgUser } from '../tg/telegram';
import { useNav } from '../store/nav';
import { useStore } from '../store/store';
import { t } from '../i18n';
import { weekdayShort } from '../i18n/format';
import { dayKeyToMs } from '../lib/calendar';
import { Emoji } from './Emoji';

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

export const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const;
export const soft = { type: 'spring', stiffness: 260, damping: 30 } as const;

// ---------- pressable ----------

interface TapProps {
  onTap?: () => void;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  hap?: Haptic | false;
  disabled?: boolean;
  label?: string;
  scale?: number;
}

/** A button that gives a little under the finger and taps back. */
export function Tap({ onTap, children, className, style, hap = 'light', disabled, label, scale = 0.97 }: TapProps) {
  return (
    <motion.button
      type="button"
      className={cx('tap', className)}
      style={style}
      disabled={disabled}
      aria-label={label}
      whileTap={disabled ? undefined : { scale }}
      transition={{ type: 'spring', stiffness: 600, damping: 32 }}
      onClick={() => {
        if (hap) haptic(hap);
        onTap?.();
      }}
    >
      {children}
    </motion.button>
  );
}

export function Card({ children, className, pad = true, style }: { children?: ReactNode; className?: string; pad?: boolean; style?: CSSProperties }) {
  return (
    <div className={cx('card', pad && 'pad', className)} style={style}>
      {children}
    </div>
  );
}

export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children?: ReactNode }) {
  return (
    <>
      <div className="sec">
        <h2 className="t-h">{title}</h2>
        {action && onAction ? (
          <Tap className="sec-act" onTap={onAction} scale={0.94}>
            {action}
            <CaretRight size={15} weight="bold" />
          </Tap>
        ) : null}
      </div>
      {children}
    </>
  );
}

export function IconBtn({ children, onTap, label, small }: { children: ReactNode; onTap: () => void; label: string; small?: boolean }) {
  return (
    <Tap className={cx('ibtn', small && 'sm')} onTap={onTap} label={label} scale={0.9}>
      {children}
    </Tap>
  );
}

// ---------- header and screen frame ----------

export function Avatar({ large }: { large?: boolean }) {
  const name = useStore((s) => s.profile.name) || tgUser.firstName || t('common.guest');
  const [broken, setBroken] = useState(false);
  return (
    <div className={cx('avatar', large && 'lg')}>
      {tgUser.photoUrl && !broken ? (
        <img src={tgUser.photoUrl} alt="" onError={() => setBroken(true)} referrerPolicy="no-referrer" />
      ) : (
        <span>{name.trim().charAt(0).toUpperCase() || 'L'}</span>
      )}
    </div>
  );
}

export function Header({ title, right, noGear }: { title: string; right?: ReactNode; noGear?: boolean }) {
  const pop = useNav((s) => s.pop);
  const push = useNav((s) => s.push);
  const depth = useNav((s) => s.stack.length);
  return (
    <header className="hdr">
      {depth > 0 ? (
        <IconBtn onTap={pop} label={t('common.back')}>
          <CaretLeft size={22} weight="bold" />
        </IconBtn>
      ) : (
        <span />
      )}
      <h1 className="hdr-title t-title clip">{title}</h1>
      {right ??
        (noGear ? (
          <span />
        ) : (
          <IconBtn onTap={() => push({ name: 'settings' })} label={t('common.settings')}>
            <Gear size={20} />
          </IconBtn>
        ))}
    </header>
  );
}

/** One scrollable screen. `fab` floats above the tab bar. */
export function Screen({ children, fab }: { children: ReactNode; fab?: ReactNode }) {
  return (
    <>
      <div className={cx('scroll', !!fab && 'has-fab')}>
        <div className="col">{children}</div>
      </div>
      {fab ? <div className="fab">{fab}</div> : null}
    </>
  );
}

// ---------- chips and segmented controls ----------

export interface Option<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

export function Chips<T extends string>({ options, value, onChange }: { options: Option<T>[]; value: T; onChange: (id: T) => void }) {
  const group = useId();
  return (
    <div className="chips" role="tablist">
      {options.map((o) => (
        <Tap key={o.id} className={cx('chip', o.id === value && 'on')} onTap={() => onChange(o.id)} hap="select" scale={0.95}>
          {o.id === value ? <motion.i layoutId={`chip-${group}`} className="chip-bg" transition={spring} /> : null}
          <span>
            {o.icon}
            {o.label}
          </span>
        </Tap>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: Option<T>[]; value: T; onChange: (id: T) => void }) {
  const group = useId();
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={cx(o.id === value && 'on')}
          onClick={() => {
            haptic('select');
            onChange(o.id);
          }}
        >
          {o.id === value ? <motion.i layoutId={`seg-${group}`} className="seg-bg" transition={spring} /> : null}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- check, progress, toggle ----------

export function Check({ on, green, size = 28 }: { on: boolean; green?: boolean; size?: number }) {
  return (
    <span className={cx('check', on && 'on', green && 'green')} style={{ width: size, height: size }}>
      {on ? (
        <motion.span initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 22 }}>
          <CheckIcon size={size * 0.56} weight="bold" />
        </motion.span>
      ) : null}
    </span>
  );
}

/** A check with a comfortable hit area. */
export function CheckTap({ on, onTap, green, label }: { on: boolean; onTap: () => void; green?: boolean; label: string }) {
  return (
    <Tap className="check-wrap" onTap={onTap} hap={on ? 'light' : 'medium'} label={label} scale={0.84}>
      <Check on={on} green={green} />
    </Tap>
  );
}

export function Bar({ value, color, height = 8 }: { value: number; color?: string; height?: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="bar" style={{ height }}>
      <motion.i
        initial={{ width: 0 }}
        animate={{ width: `${v * 100}%` }}
        transition={{ duration: lowPerf ? 0 : 0.7, ease: [0.22, 0.8, 0.26, 1] }}
        style={color ? { background: color, boxShadow: `0 0 12px ${color}88` } : undefined}
      />
    </div>
  );
}

interface RingProps {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string; // solid color instead of the blue gradient
  children?: ReactNode;
  glow?: boolean;
}

/** The glowing progress ring. */
export function Ring({ value, size = 120, stroke = 12, color, children, glow = true }: RingProps) {
  const id = useId().replace(/:/g, '');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible', transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={color ?? '#7db0ff'} />
            <stop offset="1" stopColor={color ?? '#2a5fee'} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: lowPerf ? 0 : 1.1, ease: [0.22, 0.8, 0.26, 1] }}
          style={glow && !lowPerf ? { filter: `drop-shadow(0 0 7px ${color ?? 'rgba(61,123,255,.85)'})` } : undefined}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={cx('toggle', on && 'on')}
      onClick={() => {
        haptic(on ? 'light' : 'medium');
        onChange(!on);
      }}
    >
      <i />
    </button>
  );
}

/** A number that counts up to its value. */
export function Num({ value, format }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(value);
  const reduce = useReducedMotion();
  const fmt = format ?? ((n: number) => String(Math.round(n)));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || lowPerf || from.current === value) {
      el.textContent = fmt(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.8,
      ease: [0.22, 0.8, 0.26, 1],
      onUpdate: (n) => {
        el.textContent = fmt(n);
      },
    });
    from.current = value;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span ref={ref} className="num">
      {fmt(value)}
    </span>
  );
}

// ---------- the glowing icon tile ----------

type IconProps = { style?: CSSProperties; size?: number; weight?: string; fill?: string; color?: string };

/**
 * The look every icon holder shares: a rounded square tinted by the icon's colour, the icon drawn in
 * thin glowing lines. The colour is read off the icon (`style.color`, or `color`), so callers keep
 * passing icons as they always have; a Phosphor icon is redrawn in its outline weight.
 */
export function glow(icon: ReactNode, fallback = 'var(--blue-hi)'): { icon: ReactNode; style: CSSProperties } {
  if (!isValidElement(icon)) return { icon, style: { '--g': fallback } as CSSProperties };
  const el = icon as ReactElement<IconProps>;
  const p = el.props;
  const color = p.style?.color ?? p.color ?? fallback;
  // Phosphor icons take a size; emoji and other spans do not, and are left as they are.
  const phosphor = typeof p.size === 'number' && typeof el.type !== 'string';
  const drawn = phosphor ? cloneElement(el, { weight: 'regular', fill: 'currentColor', style: { ...p.style, color: undefined } }) : icon;
  return { icon: drawn, style: { '--g': color } as CSSProperties };
}

/** An icon on its glowing tile. */
export function Glyph({ icon, color, className, size }: { icon: ReactNode; color?: string; className?: string; size?: number }) {
  // Emoji keep their own colours, so their tile is tinted gently in a neutral grey unless asked otherwise.
  const g = glow(icon, color ?? (isValidElement(icon) && typeof (icon.props as IconProps).size === 'number' ? undefined : 'var(--glyph-plain)'));
  return (
    <span className={cx('glyph', className)} style={{ ...g.style, ...(color ? { '--g': color } : null), ...(size ? { width: size, height: size } : null) } as CSSProperties}>
      {typeof g.icon === 'string' ? <Emoji e={g.icon} /> : g.icon}
    </span>
  );
}

// ---------- rows, bubbles, empty ----------

export function Bubble({ icon, color, size }: { icon: ReactNode; color?: string; size?: 'sm' | 'lg' }) {
  return <Glyph icon={icon} color={color} className={cx('bubble', size)} />;
}

interface RowProps {
  icon?: ReactNode;
  title: string;
  sub?: string;
  value?: string;
  right?: ReactNode;
  onTap?: () => void;
  danger?: boolean;
}

/** A settings-style list row. */
export function Row({ icon, title, sub, value, right, onTap, danger }: RowProps) {
  const body = (
    <>
      {icon ? <Glyph icon={icon} className="lrow-ic" /> : null}
      <span className="grow">
        <span className="t-body" style={{ display: 'block', color: danger ? 'var(--red)' : undefined }}>
          {title}
        </span>
        {sub ? <span className="t-small muted" style={{ display: 'block', marginTop: 2 }}>{sub}</span> : null}
      </span>
      {value ? <span className="lrow-val">{value}</span> : null}
      {right}
      {onTap && !right ? <CaretRight size={18} className="chev" weight="bold" /> : null}
    </>
  );
  return onTap ? (
    <Tap className="lrow" onTap={onTap} scale={0.985}>
      {body}
    </Tap>
  ) : (
    <div className="lrow">{body}</div>
  );
}

export function Empty({ icon, title, body, children }: { icon: string; title: string; body?: string; children?: ReactNode }) {
  return (
    <Card className="empty" pad={false}>
      <div className="empty-ic"><Emoji e={icon} /></div>
      <div className="t-h">{title}</div>
      {body ? <div className="t-small muted">{body}</div> : null}
      {children}
    </Card>
  );
}

// ---------- the day picker ----------

interface DayStripProps {
  days: string[]; // day keys
  value: string;
  onChange: (day: string) => void;
  marks?: Set<string>; // days that get a dot
  dim?: (day: string) => boolean;
}

export function DayStrip({ days, value, onChange, marks, dim }: DayStripProps) {
  const group = useId();
  return (
    <div className="days">
      {days.map((d) => {
        const date = new Date(dayKeyToMs(d, 12));
        const on = d === value;
        return (
          <Tap key={d} className={cx('day', on && 'on', dim?.(d) && 'dim')} onTap={() => onChange(d)} hap="select" scale={0.93}>
            {on ? <motion.i layoutId={`day-${group}`} className="day-bg" transition={spring} /> : null}
            <span className="day-w">{weekdayShort(date.getDay())}</span>
            <span className="day-n num">{date.getDate()}</span>
            {marks?.has(d) ? <span className="day-dot" /> : null}
          </Tap>
        );
      })}
    </div>
  );
}

// ---------- form bits ----------

export function Field({ label, hint, children }: { label?: string; hint?: ReactNode; children: ReactNode }) {
  // A div, not a <label>: a label would pass a stray tap on to the first button inside it.
  return (
    <div className="field">
      {label ? <span className="label">{label}</span> : null}
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          className={cx('swatch', c === value && 'on')}
          style={{ background: c }}
          onClick={() => {
            haptic('select');
            onChange(c);
          }}
        />
      ))}
    </div>
  );
}

export function EmojiPick({ emojis, value, onChange }: { emojis: string[]; value: string; onChange: (e: string) => void }) {
  return (
    <div className="emojis">
      {emojis.map((e) => (
        <button
          key={e}
          type="button"
          className={cx('emoji', e === value && 'on')}
          onClick={() => {
            haptic('select');
            onChange(e);
          }}
        >
          <Emoji e={e} />
        </button>
      ))}
    </div>
  );
}

/** Items that fade and rise in one after another. */
export function Stagger({ children, className }: { children: ReactNode[]; className?: string }) {
  if (lowPerf) return <div className={className}>{children}</div>;
  return (
    <div className={className}>
      {children.map((child, i) => (
        <motion.div
          key={(child as any)?.key ?? i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: Math.min(i, 8) * 0.04, ease: [0.22, 0.8, 0.26, 1] }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
