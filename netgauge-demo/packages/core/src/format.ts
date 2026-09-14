/**
 * Formatting helpers shared by the tray tooltip, the desktop widget and the website.
 * Everything here is pure so it can be unit-tested without a UI.
 */

export type UnitMode = 'bits' | 'bytes';

export interface FormattedSpeed {
  /** Numeric value after scaling, e.g. `42.7`. */
  value: number;
  /** Unit suffix, e.g. `Mbps` or `MB/s`. */
  unit: string;
  /** Ready-to-render string, e.g. `42.7 Mbps`. */
  text: string;
  /** Decimal scale that was applied (1e3, 1e6, 1e9). */
  scale: number;
}

const BIT_UNITS: ReadonlyArray<{ scale: number; unit: string }> = [
  { scale: 1e9, unit: 'Gbps' },
  { scale: 1e6, unit: 'Mbps' },
  { scale: 1e3, unit: 'kbps' },
];

const BYTE_UNITS: ReadonlyArray<{ scale: number; unit: string }> = [
  { scale: 1e9, unit: 'GB/s' },
  { scale: 1e6, unit: 'MB/s' },
  { scale: 1e3, unit: 'kB/s' },
];

/** Fixed-scale override, used when the user pins a unit in settings. */
export type PinnedUnit = 'auto' | 'kbps' | 'mbps' | 'gbps' | 'kBps' | 'MBps' | 'GBps';

export function formatSpeed(
  bitsPerSecond: number,
  mode: UnitMode = 'bits',
  options: { pinned?: PinnedUnit; digits?: number; separator?: string } = {},
): FormattedSpeed {
  const { pinned = 'auto', digits, separator = ' ' } = options;
  const safe = Number.isFinite(bitsPerSecond) ? Math.max(0, bitsPerSecond) : 0;

  if (pinned !== 'auto') {
    const table: Record<Exclude<PinnedUnit, 'auto'>, { scale: number; unit: string; fromBits: number }> = {
      kbps: { scale: 1e3, unit: 'kbps', fromBits: 1 },
      mbps: { scale: 1e6, unit: 'Mbps', fromBits: 1 },
      gbps: { scale: 1e9, unit: 'Gbps', fromBits: 1 },
      kBps: { scale: 1e3, unit: 'kB/s', fromBits: 8 },
      MBps: { scale: 1e6, unit: 'MB/s', fromBits: 8 },
      GBps: { scale: 1e9, unit: 'GB/s', fromBits: 8 },
    };
    const t = table[pinned];
    const value = safe / t.fromBits / t.scale;
    return { value, unit: t.unit, text: `${trim(value, digits ?? 2)}${separator}${t.unit}`, scale: t.scale };
  }

  const units = mode === 'bits' ? BIT_UNITS : BYTE_UNITS;
  const value0 = mode === 'bits' ? safe : safe / 8;
  for (const { scale, unit } of units) {
    if (value0 >= scale) {
      const value = value0 / scale;
      // Two decimals below 10 ("9.85 Mbps"), one above ("42.7 Mbps") — reads well
      // in a gauge without the digits flickering every frame.
      return { value, unit, text: `${trim(value, digits ?? (value < 10 ? 2 : 1))}${separator}${unit}`, scale };
    }
  }
  const unit = mode === 'bits' ? 'bps' : 'B/s';
  return { value: value0, unit, text: `${trim(value0, 0)}${separator}${unit}`, scale: 1 };
}

function trim(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(digits);
  // "12.0" reads worse than "12" in a tray tooltip / gauge.
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < SIZE_UNITS.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${trim(value, i === 0 ? 0 : digits)} ${SIZE_UNITS[i]}`;
}

export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${trim(ms, ms < 10 ? 1 : 0)} ms`;
  return `${trim(ms / 1000, 2)} s`;
}
