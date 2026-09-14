import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ChunkSizer,
  Meter,
  SpeedTester,
  bufferbloatGrade,
  summarizeSeries,
} from '@netgauge/core';

/* ------------------------------------------------------------------ *
 * Meter + ChunkSizer — the pure parts of the measurement
 * ------------------------------------------------------------------ */

describe('Meter', () => {
  it('computes a trailing-window rate, not a since-the-start average', () => {
    let clock = 0;
    const meter = new Meter(() => clock);
    // 12,500 bytes every 100 ms = 1 Mbps.
    for (let i = 0; i < 20; i += 1) {
      clock += 100;
      meter.add(12_500);
    }
    expect(meter.instant(500)).toBeCloseTo(1_000_000, -3);

    // …then ten times faster for the next half second.
    for (let i = 0; i < 5; i += 1) {
      clock += 100;
      meter.add(125_000); // 10 Mbps
    }
    // The window must reflect the *recent* rate, not the whole run (2 Mbps average).
    expect(meter.instant(500)).toBeCloseTo(10_000_000, -5);
  });

  it('anchors on the newest sample at or before the cutoff, so the window is never shorter', () => {
    let clock = 0;
    const meter = new Meter(() => clock);
    clock = 1000;
    meter.add(12_500);
    clock = 2000;
    meter.add(12_500);
    // Cutoff is 1750 ms, so the newest sample at or before it is the one at 1000 ms
    // (12,500 bytes cumulative). The window is therefore 1.5 s, not 0.75 s —
    // deliberately: anchoring on the first sample *after* the cutoff would silently
    // shrink the window and bias the live rate upwards.
    clock = 2500;
    expect(meter.instant(750)).toBeCloseTo((12_500 / 1.5) * 8, -2);
  });

  it('ignores negative and non-finite additions', () => {
    const meter = new Meter(() => 0);
    meter.add(-5);
    meter.add(Number.NaN);
    expect(meter.total()).toBe(0);
  });

  it('flush() closes the series so the last sample timestamp is accurate', () => {
    let clock = 0;
    const meter = new Meter(() => clock);
    clock = 500;
    meter.add(500_000);
    clock = 1000;
    meter.flush();
    const last = meter.samples[meter.samples.length - 1];
    expect(last?.t).toBe(1000);
    expect(last?.bytes).toBe(500_000);
  });

  it('excludes the warm-up from the percentile reduction', () => {
    let clock = 0;
    const meter = new Meter(() => clock);
    // Ten slow-start samples at 1 Mbps, then forty at a steady 10 Mbps.
    for (let i = 0; i < 10; i += 1) {
      clock += 100;
      meter.add(12_500);
    }
    for (let i = 0; i < 40; i += 1) {
      clock += 100;
      meter.add(125_000);
    }
    meter.flush();

    // With a quarter of the window dropped, every remaining sample is at 10 Mbps.
    expect(meter.steadyPercentile(0.25, 10)).toBeCloseTo(10_000_000, -5);
    expect(meter.steadyPercentile(0.25, 90)).toBeCloseTo(10_000_000, -5);
    // Without the warm-up trim the 10th percentile is the slow-start rate.
    expect(meter.steadyPercentile(0, 10)).toBeLessThan(2_000_000);
    expect(meter.steadySeries(0.25).length).toBeLessThan(meter.series().length);
  });
});

describe('ChunkSizer', () => {
  it('starts small and doubles while requests finish too fast', () => {
    const sizer = new ChunkSizer({ min: 64 * 1024, max: 8 * 1024 * 1024, targetMs: 1000 });
    expect(sizer.next()).toBe(64 * 1024);
    sizer.observe(64 * 1024, 50);
    expect(sizer.next()).toBe(128 * 1024);
    sizer.observe(128 * 1024, 50);
    expect(sizer.next()).toBe(256 * 1024);
  });

  it('shrinks when a request overshoots the target duration', () => {
    const sizer = new ChunkSizer({ min: 64 * 1024, max: 8 * 1024 * 1024, targetMs: 1000 });
    sizer.observe(64 * 1024, 100);
    sizer.observe(128 * 1024, 100);
    sizer.observe(256 * 1024, 100);
    expect(sizer.next()).toBe(512 * 1024);
    sizer.observe(512 * 1024, 5000); // painfully slow
    expect(sizer.next()).toBe(256 * 1024);
  });

  it('never leaves the configured bounds', () => {
    const sizer = new ChunkSizer({ min: 1024 * 1024, max: 2 * 1024 * 1024, targetMs: 1000 });
    for (let i = 0; i < 20; i += 1) sizer.observe(1024 * 1024, 1);
    expect(sizer.next()).toBe(2 * 1024 * 1024);
    for (let i = 0; i < 20; i += 1) sizer.observe(2 * 1024 * 1024, 60_000);
    expect(sizer.next()).toBe(1024 * 1024);
  });

  it('pins to the maximum when adaptive sizing is off', () => {
    const sizer = new ChunkSizer({ min: 64 * 1024, max: 4 * 1024 * 1024, enabled: false });
    expect(sizer.next()).toBe(4 * 1024 * 1024);
  });
});

/* ------------------------------------------------------------------ *
 * Full engine run against a Cloudflare-shaped server
 * ------------------------------------------------------------------ */

/** Mimics speed.cloudflare.com: `/__down?bytes=N`, `/__up`, `/meta` with a foreign shape. */
class CloudflareLikeServer {
  private server: Server | null = null;
  baseUrl = '';
  zeroByteProbes = 0;
  metaCalls = 0;

  async start(): Promise<void> {
    const chunk = new Uint8Array(64 * 1024).fill(0x33);
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/__down') {
        const bytes = Number(url.searchParams.get('bytes') ?? 0);
        if (bytes === 0) {
          this.zeroByteProbes += 1;
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{}');
          return;
        }
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(bytes) });
        let sent = 0;
        const pump = () => {
          let ok = true;
          while (sent < bytes && ok) {
            const n = Math.min(chunk.length, bytes - sent);
            ok = res.write(n === chunk.length ? chunk : chunk.subarray(0, n));
            sent += n;
          }
          if (sent >= bytes) res.end();
          else res.once('drain', pump);
        };
        pump();
        return;
      }
      if (url.pathname === '/__up') {
        req.on('data', () => undefined);
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"ok":true}');
        });
        return;
      }
      if (url.pathname === '/meta') {
        this.metaCalls += 1;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            hostname: 'speed.cloudflare.com',
            clientIp: '203.0.113.9',
            city: 'Mumbai',
            region: 'MH',
            country: 'IN',
            asOrganization: 'Example Telecom',
          }),
        );
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    this.baseUrl = `http://127.0.0.1:${(this.server?.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = null;
  }
}

const CF_PATHS = { ping: '/__down?bytes=0', download: '/__down', upload: '/__up', meta: '/meta' };

describe('SpeedTester against a Cloudflare-shaped server', () => {
  let server: CloudflareLikeServer;

  beforeEach(async () => {
    server = new CloudflareLikeServer();
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('appends its cache-buster to a path that already has a query string', async () => {
    await new SpeedTester({
      baseUrl: server.baseUrl,
      paths: CF_PATHS,
      phaseDurationMs: 600,
      concurrency: 2,
      pingCount: 4,
    }).promise;
    expect(server.zeroByteProbes).toBeGreaterThanOrEqual(4);
  });

  it('reports percentiles, median latency and a bufferbloat grade', async () => {
    const result = await new SpeedTester({
      baseUrl: server.baseUrl,
      paths: CF_PATHS,
      phaseDurationMs: 800,
      concurrency: 3,
      pingCount: 5,
    }).promise;

    expect(result.downBps).toBeGreaterThan(0);
    expect(result.downBpsP90).toBeGreaterThan(0);
    expect(result.downBpsMedian).toBeGreaterThan(0);
    expect(result.upBpsP90).toBeGreaterThanOrEqual(0);
    expect(result.medianLatencyMs).toBeGreaterThan(0);
    expect(result.latencySeries.length).toBe(5 - 1);
    expect(['A+', 'A', 'B', 'C', 'D', 'F', 'n/a']).toContain(result.bufferbloatGrade);
    expect(result.loadedDownLatencySeries.length).toBeGreaterThan(0);
    expect(result.method.loadedLatency).toBe(true);
  });

  it('translates a foreign /meta payload through mapMeta', async () => {
    const result = await new SpeedTester({
      baseUrl: server.baseUrl,
      paths: CF_PATHS,
      phaseDurationMs: 500,
      concurrency: 2,
      pingCount: 3,
      mapMeta: (raw) => {
        const m = raw as { city?: string; asOrganization?: string };
        return { name: 'Cloudflare Edge', location: m.city, isp: m.asOrganization };
      },
    }).promise;

    expect(server.metaCalls).toBe(1);
    expect(result.server.name).toBe('Cloudflare Edge');
    expect(result.server.location).toBe('Mumbai');
    expect(result.server.isp).toBe('Example Telecom');
  });

  it('can skip the loaded-latency probes', async () => {
    const result = await new SpeedTester({
      baseUrl: server.baseUrl,
      paths: CF_PATHS,
      phaseDurationMs: 500,
      concurrency: 2,
      pingCount: 3,
      measureLoadedLatency: false,
    }).promise;
    expect(result.method.loadedLatency).toBe(false);
    expect(result.loadedDownLatencySeries).toEqual([]);
  });
});

describe('bufferbloatGrade', () => {
  it('matches the published thresholds', () => {
    expect(bufferbloatGrade(0)).toBe('A+');
    expect(bufferbloatGrade(5)).toBe('A+');
    expect(bufferbloatGrade(6)).toBe('A');
    expect(bufferbloatGrade(30)).toBe('A');
    expect(bufferbloatGrade(31)).toBe('B');
    expect(bufferbloatGrade(60)).toBe('B');
    expect(bufferbloatGrade(61)).toBe('C');
    expect(bufferbloatGrade(200)).toBe('C');
    expect(bufferbloatGrade(201)).toBe('D');
    expect(bufferbloatGrade(400)).toBe('D');
    expect(bufferbloatGrade(401)).toBe('F');
    expect(bufferbloatGrade(-1)).toBe('n/a');
    expect(bufferbloatGrade(Number.NaN)).toBe('n/a');
  });
});

describe('summarizeSeries', () => {
  it('summarises a sample series and drops unusable values', () => {
    const s = summarizeSeries([1e6, 2e6, Number.NaN, -5, 3e6]);
    expect(s.count).toBe(3);
    expect(s.min).toBe(1e6);
    expect(s.max).toBe(3e6);
    expect(s.median).toBe(2e6);
    expect(s.p90).toBeGreaterThan(2e6);
    expect(s.variability).toBeGreaterThan(0);
  });

  it('returns zeroes for an empty series rather than NaN', () => {
    expect(summarizeSeries([])).toEqual({ count: 0, min: 0, median: 0, mean: 0, p90: 0, max: 0, variability: 0 });
  });
});
