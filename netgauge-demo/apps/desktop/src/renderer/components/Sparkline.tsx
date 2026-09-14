import type { LiveSample } from '../../shared/bridge';

interface Props {
  history: LiveSample[];
  height?: number;
  referenceBps?: number;
  showUp?: boolean;
}

/** Live throughput chart drawn straight from the sample ring buffer. */
export default function Sparkline({ history, height = 64, referenceBps, showUp = true }: Props) {
  const width = 320;
  const points = history.slice(-120);
  if (points.length < 2) {
    return <div className="ng-panel" style={{ height }} />;
  }

  const peak = Math.max(...points.map((p) => Math.max(p.smoothDownBps, p.smoothUpBps)), referenceBps ?? 0, 1e6);
  const step = width / (points.length - 1);
  const y = (bps: number) => height - Math.min(1, bps / peak) * (height - 4) - 2;

  const path = (pick: (s: LiveSample) => number) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join(' ');

  const downLine = path((p) => p.smoothDownBps);
  const upLine = path((p) => p.smoothUpBps);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="ng-down-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ng-accent)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--ng-accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ng-up-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={`${downLine} L ${width} ${height} L 0 ${height} Z`} fill="url(#ng-down-fill)" />
      <path d={downLine} fill="none" stroke="var(--ng-accent)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />

      {showUp && (
        <>
          <path d={`${upLine} L ${width} ${height} L 0 ${height} Z`} fill="url(#ng-up-fill)" />
          <path d={upLine} fill="none" stroke="#a78bfa" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
