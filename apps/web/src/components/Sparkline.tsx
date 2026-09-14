interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  strokeWidth?: number;
  gradientId?: string;
}

/** Dependency-free SVG sparkline for live throughput and result history. */
export default function Sparkline({
  values,
  width = 220,
  height = 44,
  className,
  strokeWidth = 2,
  gradientId = 'ng-spark',
}: SparklineProps) {
  if (values.length < 2) {
    return <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden />;
  }
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${points.join(' L ')}`;
  const area = `${line} L ${width},${height} L 0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={`url(#${gradientId}-stroke)`} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
