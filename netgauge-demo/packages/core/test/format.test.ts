import { describe, expect, it } from 'vitest';
import { formatBytes, formatLatency, formatSpeed } from '@netgauge/core';

describe('formatSpeed', () => {
  it('auto-scales bits', () => {
    expect(formatSpeed(950).text).toBe('950 bps');
    expect(formatSpeed(1_500).text).toBe('1.5 kbps');
    expect(formatSpeed(42_700_000).text).toBe('42.7 Mbps');
    expect(formatSpeed(1_240_000_000).text).toBe('1.24 Gbps');
  });

  it('auto-scales bytes when the user prefers MB/s', () => {
    expect(formatSpeed(80_000_000, 'bytes').text).toBe('10 MB/s');
    expect(formatSpeed(8_000_000, 'bytes').text).toBe('1 MB/s');
  });

  it('honours a pinned unit', () => {
    expect(formatSpeed(1_000_000, 'bits', { pinned: 'kbps' }).text).toBe('1000 kbps');
    expect(formatSpeed(8_000_000, 'bits', { pinned: 'MBps' }).text).toBe('1 MB/s');
  });

  it('never renders NaN or negative rates', () => {
    expect(formatSpeed(Number.NaN).text).toBe('0 bps');
    expect(formatSpeed(-5_000).text).toBe('0 bps');
    expect(formatSpeed(Number.POSITIVE_INFINITY).unit).toBe('bps');
  });
});

describe('formatBytes / formatLatency', () => {
  it('formats cumulative totals in binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5 GB');
  });

  it('formats latency across magnitudes', () => {
    expect(formatLatency(0.4)).toBe('400 µs');
    expect(formatLatency(8.24)).toBe('8.2 ms');
    expect(formatLatency(123)).toBe('123 ms');
    expect(formatLatency(2500)).toBe('2.5 s');
  });
});
