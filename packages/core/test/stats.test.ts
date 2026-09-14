import { describe, expect, it } from 'vitest';
import { RingBuffer, ema, jitterMs, median, niceCeil, percentile, ratesFromCumulative, steadyStateBps } from '@netgauge/core';

describe('stats', () => {
  it('interpolates percentiles', () => {
    const values = [10, 20, 30, 40];
    expect(median(values)).toBe(25);
    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 100)).toBe(40);
    expect(percentile([], 50)).toBe(0);
  });

  it('computes jitter as the mean absolute RTT delta', () => {
    expect(jitterMs([10, 12, 11, 15])).toBeCloseTo((2 + 1 + 4) / 3, 5);
    expect(jitterMs([10])).toBe(0);
    expect(jitterMs([])).toBe(0);
  });

  it('smooths with an EMA', () => {
    expect(ema(100, 200, 0.5)).toBe(150);
    expect(ema(100, 200, 0)).toBe(100);
    expect(ema(100, 200, 1)).toBe(200);
  });

  it('keeps a ring buffer bounded', () => {
    const rb = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((v) => rb.push(v));
    expect(rb.toArray()).toEqual([3, 4, 5]);
    expect(rb.last()).toBe(5);
    expect(rb.length).toBe(3);
  });

  it('turns cumulative byte samples into bit rates', () => {
    const rates = ratesFromCumulative([
      { t: 0, bytes: 0 },
      { t: 1000, bytes: 125_000 },
      { t: 2000, bytes: 375_000 },
    ]);
    expect(rates).toEqual([1_000_000, 2_000_000]);
  });

  it('ignores clock skew and duplicate timestamps', () => {
    const rates = ratesFromCumulative([
      { t: 1000, bytes: 125_000 },
      { t: 1000, bytes: 250_000 },
      { t: 900, bytes: 500_000 },
    ]);
    expect(rates).toEqual([]);
  });

  it('excludes TCP slow start from the steady-state rate', () => {
    // 0 bytes for the first second (slow start), then a steady 1 MB/s.
    const points = [
      { t: 0, bytes: 0 },
      { t: 1000, bytes: 0 },
      { t: 2000, bytes: 125_000 },
      { t: 3000, bytes: 250_000 },
      { t: 4000, bytes: 375_000 },
    ];
    const naive = ((375_000 / 4) * 8);
    const steady = steadyStateBps(points, 0.2);
    expect(steady).toBeCloseTo(1_000_000, -2);
    expect(steady).toBeGreaterThan(naive);
  });

  it('rounds chart axes up to a readable number', () => {
    expect(niceCeil(0)).toBe(10);
    expect(niceCeil(140)).toBe(200);
    expect(niceCeil(4_200_000)).toBe(5_000_000);
    expect(niceCeil(9_999)).toBe(10_000);
  });
});
