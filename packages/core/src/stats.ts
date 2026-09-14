/** Small statistics toolkit used for latency/jitter reporting and gauge smoothing. */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function median(values: number[]): number {
  return percentile(values, 50);
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (clamp(p, 0, 100) / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low] ?? 0;
  const weight = rank - low;
  return (sorted[low] ?? 0) * (1 - weight) + (sorted[high] ?? 0) * weight;
}

export function min(values: number[]): number {
  return values.length === 0 ? 0 : Math.min(...values);
}

export function max(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

/**
 * Mean absolute difference between consecutive RTT samples — the "jitter" number
 * speed test clients report (RFC 6349 style, unsmoothed).
 */
export function jitterMs(rtts: number[]): number {
  if (rtts.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < rtts.length; i += 1) {
    sum += Math.abs((rtts[i] ?? 0) - (rtts[i - 1] ?? 0));
  }
  return sum / (rtts.length - 1);
}

/** Exponential moving average — used to keep the live gauge from flickering. */
export function ema(previous: number, next: number, alpha: number): number {
  const a = clamp(alpha, 0, 1);
  return previous * (1 - a) + next * a;
}

/** Fixed-capacity ring buffer, oldest-first on read. */
export class RingBuffer<T> {
  private readonly items: T[] = [];
  constructor(private readonly capacity: number) {}

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.splice(0, this.items.length - this.capacity);
  }

  get length(): number {
    return this.items.length;
  }

  last(): T | undefined {
    return this.items[this.items.length - 1];
  }

  toArray(): T[] {
    return [...this.items];
  }

  clear(): void {
    this.items.length = 0;
  }
}

export interface TimeSeriesPoint {
  t: number;
  bytes: number;
}

/**
 * Turns cumulative `(timestamp, bytes)` samples into per-second rates.
 * Samples must be monotonically increasing in time; duplicate timestamps are dropped.
 */
export function ratesFromCumulative(points: TimeSeriesPoint[]): number[] {
  const rates: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!prev || !curr) continue;
    const dt = (curr.t - prev.t) / 1000;
    const dBytes = curr.bytes - prev.bytes;
    if (dt <= 0 || dBytes < 0) continue;
    rates.push((dBytes / dt) * 8);
  }
  return rates;
}

/**
 * Steady-state throughput from a byte/time series: drops the first `warmupFraction`
 * of the window (TCP slow start) and averages the remainder by total bytes / total time.
 */
export function steadyStateBps(points: TimeSeriesPoint[], warmupFraction = 0.2): number {
  if (points.length < 2) return 0;
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) return 0;
  const span = end.t - start.t;
  if (span <= 0) return 0;
  const cutoff = start.t + span * clamp(warmupFraction, 0, 0.9);
  const anchor = points.find((p) => p.t >= cutoff) ?? start;
  const dt = (end.t - anchor.t) / 1000;
  if (dt <= 0) return 0;
  return ((end.bytes - anchor.bytes) / dt) * 8;
}

/** Auto-scale max for a chart axis so the line never sits flat at the top. */
export function niceCeil(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}
