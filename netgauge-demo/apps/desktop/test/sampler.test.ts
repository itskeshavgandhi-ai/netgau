import { describe, expect, it } from 'vitest';
import type { IfaceCounters } from '@netgauge/core';
import { Sampler, parseCounterBlock, splitBlocks, type CounterReader } from '../src/main/sampler';
import { materialFor } from '../src/main/windows';

function fakeReader(snapshots: IfaceCounters[][], opts: { delay?: number } = {}) {
  let index = 0;
  return {
    kind: 'fake',
    disposed: 0,
    read: async () => {
      if (opts.delay) await new Promise((resolve) => setTimeout(resolve, opts.delay));
      const snapshot = snapshots[Math.min(index, snapshots.length - 1)];
      index += 1;
      return snapshot ?? [];
    },
    dispose() {
      this.disposed += 1;
    },
  } satisfies CounterReader & { disposed: number };
}

const base = {
  intervalMs: 1000,
  adapter: 'auto',
  includeVirtual: false,
  smoothing: 1,
  onSample: () => undefined,
};

describe('Sampler', () => {
  it('reports zeroes on the first tick, then a real rate', async () => {
    const reader = fakeReader([
      [{ name: 'eth0', rxBytes: 0, txBytes: 0 }],
      [{ name: 'eth0', rxBytes: 125_000, txBytes: 25_000 }],
    ]);
    const samples: number[] = [];
    let clock = 1000;
    const sampler = new Sampler({ ...base, reader, onSample: (s) => samples.push(s.downBps), now: () => clock });

    const first = await sampler.tick();
    expect(first?.downBps).toBe(0);

    clock = 2000; // exactly one second later
    const second = await sampler.tick();
    expect(second?.downBps).toBe(1_000_000);
    expect(second?.upBps).toBe(200_000);
    expect(samples).toEqual([0, 1_000_000]);
  });

  it('scales the rate by the real elapsed time', async () => {
    const reader = fakeReader([
      [{ name: 'eth0', rxBytes: 0, txBytes: 0 }],
      [{ name: 'eth0', rxBytes: 250_000, txBytes: 0 }],
    ]);
    let clock = 0;
    const sampler = new Sampler({ ...base, reader, now: () => clock });
    await sampler.tick();
    clock = 2000; // two seconds
    const sample = await sampler.tick();
    expect(sample?.downBps).toBe(1_000_000);
  });

  it('smooths with the configured EMA alpha', async () => {
    const reader = fakeReader([
      [{ name: 'eth0', rxBytes: 0, txBytes: 0 }],
      [{ name: 'eth0', rxBytes: 125_000, txBytes: 0 }],
    ]);
    let clock = 0;
    const sampler = new Sampler({ ...base, reader, smoothing: 0.5, now: () => clock });
    await sampler.tick();
    clock = 1000;
    const sample = await sampler.tick();
    // 1 Mbps raw, smoothed from 0 at alpha 0.5.
    expect(sample?.downBps).toBe(1_000_000);
    expect(sample?.smoothDownBps).toBe(500_000);
  });

  it('only counts the selected adapter', async () => {
    const reader = fakeReader([
      [
        { name: 'eth0', rxBytes: 0, txBytes: 0 },
        { name: 'wlan0', rxBytes: 0, txBytes: 0 },
      ],
      [
        { name: 'eth0', rxBytes: 125_000, txBytes: 0 },
        { name: 'wlan0', rxBytes: 125_000, txBytes: 0 },
      ],
    ]);
    let clock = 0;
    const sampler = new Sampler({ ...base, adapter: 'wlan0', reader, now: () => clock });
    await sampler.tick();
    clock = 1000;
    const sample = await sampler.tick();
    expect(sample?.downBps).toBe(1_000_000);
    expect(sample?.interfaces).toEqual(['wlan0']);
  });

  it('excludes loopback unless asked', async () => {
    const snapshots = [
      [
        { name: 'lo', rxBytes: 0, txBytes: 0 },
        { name: 'eth0', rxBytes: 0, txBytes: 0 },
      ],
      [
        { name: 'lo', rxBytes: 1_250_000, txBytes: 0 },
        { name: 'eth0', rxBytes: 125_000, txBytes: 0 },
      ],
    ];
    let clock = 0;
    const physical = new Sampler({ ...base, reader: fakeReader(snapshots), now: () => clock });
    await physical.tick();
    clock = 1000;
    expect((await physical.tick())?.downBps).toBe(1_000_000);

    clock = 0;
    const all = new Sampler({ ...base, includeVirtual: true, reader: fakeReader(snapshots), now: () => clock });
    await all.tick();
    clock = 1000;
    expect((await all.tick())?.downBps).toBe(11_000_000);
  });

  it('ignores counter resets instead of spiking', async () => {
    const reader = fakeReader([
      [{ name: 'eth0', rxBytes: 5_000_000, txBytes: 5_000_000 }],
      [{ name: 'eth0', rxBytes: 100, txBytes: 100 }],
    ]);
    let clock = 0;
    const sampler = new Sampler({ ...base, reader, now: () => clock });
    await sampler.tick();
    clock = 1000;
    const sample = await sampler.tick();
    expect(sample?.downBps).toBe(0);
    expect(sample?.upBps).toBe(0);
  });

  it('never overlaps a slow reader', async () => {
    const reader = fakeReader([[{ name: 'eth0', rxBytes: 1, txBytes: 1 }]], { delay: 40 });
    const sampler = new Sampler({ ...base, reader });
    const [a, b] = await Promise.all([sampler.tick(), sampler.tick()]);
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(sampler.stats.dropped).toBe(1);
  });

  it('survives a reader that throws', async () => {
    const reader: CounterReader = {
      kind: 'broken',
      read: async () => {
        throw new Error('adapter vanished');
      },
    };
    const sampler = new Sampler({ ...base, reader });
    expect(await sampler.tick()).toBeNull();
    expect(sampler.stats.lastError).toBe('adapter vanished');
  });

  it('re-reads counters on demand for the adapter picker', async () => {
    const reader = fakeReader([[{ name: 'Wi-Fi', rxBytes: 10, txBytes: 5 }]]);
    const sampler = new Sampler({ ...base, reader });
    expect(await sampler.readCounters()).toEqual([{ name: 'Wi-Fi', rxBytes: 10, txBytes: 5 }]);
  });

  it('disposes the reader when monitoring stops for good, but not when paused', async () => {
    const reader = fakeReader([[{ name: 'eth0', rxBytes: 0, txBytes: 0 }]]);
    const sampler = new Sampler({ ...base, reader });
    sampler.start();
    sampler.stopTimer();
    expect(reader.disposed).toBe(0);
    sampler.start();
    sampler.stop();
    expect(reader.disposed).toBe(1);
  });
});

describe('Windows PowerShell output parsing', () => {
  const stream = 'Ethernet\t1000\t500\r\nWi-Fi\t2048\t1024\r\n###\r\nEthernet\t1100\t520\r\n###partial';

  it('splits complete blocks and keeps the remainder', () => {
    const { blocks, rest } = splitBlocks(stream);
    expect(blocks).toHaveLength(2);
    expect(rest).toBe('partial');
  });

  it('parses name<TAB>rx<TAB>tx rows', () => {
    const { blocks } = splitBlocks(stream);
    expect(parseCounterBlock(blocks[0] ?? '')).toEqual([
      { name: 'Ethernet', rxBytes: 1000, txBytes: 500 },
      { name: 'Wi-Fi', rxBytes: 2048, txBytes: 1024 },
    ]);
  });

  it('skips malformed rows', () => {
    expect(parseCounterBlock('Ethernet\tnotanumber\t500\n\nWi-Fi\t10\t20')).toEqual([
      { name: 'Wi-Fi', rxBytes: 10, txBytes: 20 },
    ]);
    expect(parseCounterBlock('')).toEqual([]);
  });
});

describe('window material mapping', () => {
  const withPlatform = <T,>(platform: NodeJS.Platform, version: string | undefined, run: () => T): T => {
    const originalPlatform = process.platform;
    const originalVersion = (process as { getSystemVersion?: () => string }).getSystemVersion;
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    (process as { getSystemVersion?: () => string }).getSystemVersion = () => version ?? '';
    try {
      return run();
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      (process as { getSystemVersion?: () => string }).getSystemVersion = originalVersion;
    }
  };

  it('uses the real acrylic compositor material on Windows 11', () => {
    const material = withPlatform('win32', '11.0.22631', () => materialFor('acrylic'));
    expect(material).toMatchObject({ backgroundMaterial: 'acrylic', transparent: false, backgroundColor: '#00000000' });
  });

  it('maps mica on Windows 11', () => {
    expect(withPlatform('win32', '11.0.22631', () => materialFor('mica')).backgroundMaterial).toBe('mica');
  });

  it('gives Windows 10 a transparent surface, because it has no acrylic material API', () => {
    const material = withPlatform('win32', '10.0.19045', () => materialFor('acrylic'));
    expect(material.transparent).toBe(true);
    expect(material.backgroundMaterial).toBeUndefined();
  });

  it('uses an opaque background for the solid option everywhere', () => {
    expect(withPlatform('win32', '11.0.22631', () => materialFor('solid')).backgroundColor).toBe('#0b1120');
    expect(withPlatform('linux', undefined, () => materialFor('solid')).transparent).toBe(false);
  });

  it('uses vibrancy on macOS', () => {
    expect(withPlatform('darwin', undefined, () => materialFor('transparent')).vibrancy).toBe('under-window');
  });

  it('falls back to a transparent surface on Linux', () => {
    const material = withPlatform('linux', undefined, () => materialFor('acrylic'));
    expect(material).toEqual({ transparent: true, backgroundColor: '#00000000' });
  });
});
