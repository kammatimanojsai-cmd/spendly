'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { monthLabel } from '@/lib/dates';

// Hand-built SVG charts: small, accessible (each has a text alternative) and on-brand.

export function Donut({ slices, size = 150, label, valueLabel }: { slices: { key: string | number; value: number; color: string; name: string }[]; size?: number; label: string; valueLabel: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 14, c = 2 * Math.PI * r;
  const [hover, setHover] = useState<number | null>(null);
  const reduce = useReducedMotion();
  let acc = 0;
  return (
    <figure style={{ margin: 0, position: 'relative', width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${label}: ${slices.map((s) => `${s.name} ${Math.round((s.value / total) * 100)}%`).join(', ')}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#16213E" strokeWidth={24} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth={20} />
        {total > 0 && slices.map((s, i) => {
          const len = (s.value / total) * c;
          const off = acc; acc += len;
          return (
            <motion.circle key={s.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={hover === i ? 24 : 20}
              strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
              initial={reduce ? false : { strokeDashoffset: -off + len }} animate={{ strokeDashoffset: -off }}
              transition={{ duration: .7, delay: i * .05, ease: [0.2, 0.8, 0.2, 1] }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }} />
          );
        })}
      </svg>
      <figcaption style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center', pointerEvents: 'none' }}>
        <small className="muted" style={{ fontWeight: 650 }}>{hover !== null ? slices[hover].name : 'Total'}</small>
        <b className="display" style={{ fontSize: '1.05rem' }}>{hover !== null ? `${Math.round((slices[hover].value / total) * 100)}%` : valueLabel}</b>
      </figcaption>
    </figure>
  );
}

export function CashflowBars({ data, fmt }: { data: { month: string; income: number; expense: number }[]; fmt: (n: number) => string }) {
  const W = 560, H = 210, pad = { l: 8, r: 8, t: 16, b: 30 };
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const groupW = (W - pad.l - pad.r) / data.length;
  const barW = Math.min(26, groupW / 3);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const [sel, setSel] = useState(data.length - 1);
  const reduce = useReducedMotion();
  const cur = data[sel];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <div className="chart-legend"><span><i style={{ background: 'var(--earn)' }} />Money in</span><span><i style={{ background: 'var(--spend)' }} />Money out</span></div>
        <span className="hint" aria-live="polite"><b style={{ color: 'var(--ink)' }}>{monthLabel(cur.month)}</b>: in {fmt(cur.income)}, out {fmt(cur.expense)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Money in and out for the last ${data.length} months. ${data.map((d) => `${monthLabel(d.month)}: in ${fmt(d.income)}, out ${fmt(d.expense)}`).join('; ')}`}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="#16213E" strokeWidth={2} />
        {data.map((d, i) => {
          const x = pad.l + groupW * i + groupW / 2;
          const active = i === sel;
          return (
            <g key={d.month} onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
              <rect x={x - groupW / 2} y={0} width={groupW} height={H} fill={active ? 'rgba(22,33,62,.05)' : 'transparent'} rx={8} />
              {[['income', 'var(--earn)', -barW - 2], ['expense', 'var(--spend)', 2]].map(([k, color, dx]) => {
                const v = d[k as 'income' | 'expense'];
                const top = y(v);
                return (
                  <motion.rect key={k as string} x={x + (dx as number)} width={barW} rx={4} fill={color as string} stroke="#16213E" strokeWidth={2}
                    initial={reduce ? false : { y: H - pad.b, height: 0 }} animate={{ y: top, height: Math.max(0, H - pad.b - top) }}
                    transition={{ duration: .6, delay: i * .04, ease: [0.2, 0.8, 0.2, 1] }} />
                );
              })}
              <text x={x} y={H - 10} textAnchor="middle" fontSize="13" fontWeight={active ? 800 : 600} fill="#16213E">{monthLabel(d.month)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Ring({ value, max, color, size = 92, children }: { value: number; max: number; color: string; size?: number; children?: React.ReactNode }) {
  const r = size / 2 - 9, c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const reduce = useReducedMotion();
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="#fff" stroke="#16213E" strokeWidth={2} />
        <circle cx={size / 2} cy={size / 2} r={r - 1} fill="none" stroke="#E3E8F2" strokeWidth={10} />
        <motion.circle cx={size / 2} cy={size / 2} r={r - 1} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={c} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          initial={reduce ? false : { strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: .9, ease: [0.2, 0.8, 0.2, 1] }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}
