// Hand-drawn SVG charts: small, themed, animated.
import { useId } from 'react';
import { motion } from 'motion/react';
import { lowPerf } from '../tg/telegram';
import { cx } from './kit';

/** Smooth path through points (Catmull-Rom converted to cubic Béziers). */
function smooth(points: [number, number][]): string {
  if (points.length < 2) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const k = 0.18;
    d += ` C${p1[0] + (p2[0] - p0[0]) * k},${p1[1] + (p2[1] - p0[1]) * k} ${p2[0] - (p3[0] - p1[0]) * k},${p2[1] - (p3[1] - p1[1]) * k} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** A glowing line over a soft fill. `values` are 0..1. */
export function LineChart({ values, height = 86 }: { values: number[]; height?: number }) {
  const id = useId().replace(/:/g, '');
  const w = 300;
  const pad = 10;
  // Stretch the line over the range the values really cover, so a steady week is not a flat line at the top.
  const lo = Math.max(0, Math.min(...values) - 0.12);
  const hi = Math.min(1, Math.max(...values) + 0.06);
  const span = Math.max(0.2, hi - lo);
  const pts: [number, number][] = values.map((v, i) => [
    values.length === 1 ? w / 2 : (i / (values.length - 1)) * w,
    pad + (1 - Math.max(0, Math.min(1, (v - lo) / span))) * (height - pad * 2),
  ]);
  const line = smooth(pts);
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--blue)" stopOpacity="0.34" />
          <stop offset="1" stopColor="var(--blue)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2a5fee" />
          <stop offset="1" stopColor="#7db0ff" />
        </linearGradient>
      </defs>
      {line ? (
        <>
          <motion.path d={`${line} L${w},${height} L0,${height} Z`} fill={`url(#f${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.3 }} />
          <motion.path
            d={line}
            fill="none"
            stroke={`url(#s${id})`}
            strokeWidth={3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: lowPerf ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: [0.22, 0.8, 0.26, 1] }}
            style={lowPerf ? undefined : { filter: 'drop-shadow(0 4px 8px rgba(61,123,255,.6))' }}
          />
        </>
      ) : null}
      {last ? <circle cx={last[0]} cy={last[1]} r={0} /> : null}
    </svg>
  );
}

interface BarChartProps {
  values: number[];
  labels?: string[];
  height?: number;
  highlight?: number; // index drawn at full strength (today)
  max?: number;
}

export function BarChart({ values, labels, height = 96, highlight, max }: BarChartProps) {
  const top = Math.max(max ?? 0, ...values, 1);
  return (
    <div>
      <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr', alignItems: 'end', gap: 6, height }}>
        {values.map((v, i) => (
          <div key={i} style={{ display: 'grid', justifyItems: 'center', alignItems: 'end', height: '100%' }}>
            <motion.i
              className={cx('cbar', highlight === i && 'hi', v === 0 && 'zero')}
              initial={{ height: lowPerf ? `${Math.max(6, (v / top) * 100)}%` : '6%' }}
              animate={{ height: `${Math.max(6, (v / top) * 100)}%` }}
              transition={{ duration: 0.7, delay: i * 0.035, ease: [0.22, 0.8, 0.26, 1] }}
            />
          </div>
        ))}
      </div>
      {labels ? (
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr', gap: 6, marginTop: 8 }}>
          {labels.map((l, i) => (
            <span key={i} className={cx('t-tiny center', highlight === i ? 'accent' : 'faint')}>
              {l}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const TONES: Record<string, [string, string]> = {
  blue: ['#6aa0ff', '#2a5fee'],
  violet: ['#b3a4ff', '#6a55e0'],
  orange: ['#ffbe73', '#f0791c'],
  green: ['#63e6b0', '#14a871'],
  gold: ['#ffe08a', '#e0a020'],
  pink: ['#ff9cc4', '#e0457f'],
};

/** A hexagon achievement badge. */
export function Hex({ tone, icon, locked, size = 62 }: { tone: string; icon: string; locked?: boolean; size?: number }) {
  const id = useId().replace(/:/g, '');
  const [a, b] = TONES[tone] ?? TONES.blue;
  return (
    <div style={{ position: 'relative', width: size, height: size * 1.1, flex: 'none', opacity: locked ? 0.42 : 1, filter: locked ? 'grayscale(1)' : undefined }}>
      <svg viewBox="0 0 60 66" width={size} height={size * 1.1} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`h${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
        </defs>
        <path
          d="M26.5 2.6a7 7 0 0 1 7 0l19.8 11.5a7 7 0 0 1 3.5 6v25.8a7 7 0 0 1-3.5 6L33.5 63.4a7 7 0 0 1-7 0L6.7 51.9a7 7 0 0 1-3.5-6V20.1a7 7 0 0 1 3.5-6z"
          fill={`url(#h${id})`}
          fillOpacity={0.22}
          stroke={`url(#h${id})`}
          strokeWidth={2}
          style={locked ? undefined : { filter: `drop-shadow(0 6px 12px ${b}66)` }}
        />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: size * 0.42, lineHeight: 1 }}>{icon}</span>
    </div>
  );
}
