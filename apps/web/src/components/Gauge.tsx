'use client';

import { useId, useMemo } from 'react';

export type GaugePhase = 'idle' | 'latency' | 'download' | 'upload' | 'done' | 'error';

interface GaugeProps {
  /** Current value in bits/second. */
  valueBps: number;
  /** 0..1 across the whole test — drives the outer progress ring. */
  progress?: number;
  phase?: GaugePhase;
  size?: number;
  children?: React.ReactNode;
}

const START = 135;
const SWEEP = 270;
const RADIUS = 82;
const STROKE = 13;
const CENTER = 100;
const VIEW = 200;

function polar(radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function arcPath(radius: number, fromDeg: number, toDeg: number) {
  const a = polar(radius, fromDeg);
  const b = polar(radius, toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/** Log scale, like Speedtest: 1 Mbps → 1 Gbps across the sweep. */
export function toFraction(mbps: number): number {
  if (!Number.isFinite(mbps) || mbps <= 0) return 0;
  const clamped = Math.min(Math.max(mbps, 0.01), 1000);
  const f = (Math.log10(clamped) + 2) / 5; // log10(0.01)=-2 … log10(1000)=3
  return Math.min(1, Math.max(0, f));
}

const TICKS = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000];

export default function Gauge({ valueBps, progress = 0, phase = 'idle', children }: GaugeProps) {
  const gradientId = useId();
  const mbps = valueBps / 1e6;
  const fraction = toFraction(mbps);
  const angle = START + SWEEP * fraction;
  const tip = polar(RADIUS, angle);
  const isRunning = phase === 'download' || phase === 'upload';

  const ticks = useMemo(
    () =>
      TICKS.map((value) => {
        const f = value === 0 ? 0 : toFraction(value);
        const a = START + SWEEP * f;
        const outer = polar(RADIUS + 15, a);
        const inner = polar(RADIUS + 9, a);
        const label = polar(RADIUS + 24, a);
        return { value, outer, inner, label };
      }),
    [],
  );

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(78vw,360px)] sm:max-w-[380px]">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="h-full w-full -rotate-0" role="img" aria-label="Speed gauge">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#f0abfc" />
          </linearGradient>
          <filter id={`${gradientId}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* track */}
        <path
          d={arcPath(RADIUS, START, START + SWEEP)}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />

        {/* ticks */}
        {ticks.map((t) => (
          <g key={t.value}>
            <line
              x1={t.inner.x}
              y1={t.inner.y}
              x2={t.outer.x}
              y2={t.outer.y}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={t.value === 0 || t.value === 1000 ? 1.6 : 1}
              strokeLinecap="round"
            />
            <text
              x={t.label.x}
              y={t.label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-[#6b7897] text-[6.5px] font-medium"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {t.value}
            </text>
          </g>
        ))}

        {/* outer progress ring */}
        <path
          d={arcPath(RADIUS + 20, START, START + SWEEP)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={2}
        />
        {progress > 0 && (
          <path
            d={arcPath(RADIUS + 20, START, START + SWEEP * Math.min(1, progress))}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.85}
          />
        )}

        {/* value arc */}
        {fraction > 0.001 && (
          <path
            d={arcPath(RADIUS, START, angle)}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            filter={`url(#${gradientId}-glow)`}
            style={{ transition: isRunning ? 'none' : 'd 400ms ease' }}
          />
        )}

        {/* tip dot */}
        {fraction > 0.001 && (
          <circle cx={tip.x} cy={tip.y} r={4} fill="#fff" opacity={0.95}>
            {isRunning && <animate attributeName="opacity" values="0.5;1;0.5" dur="1.2s" repeatCount="indefinite" />}
          </circle>
        )}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        {children}
      </div>
    </div>
  );
}
