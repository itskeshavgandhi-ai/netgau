import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { SpeedTestAborted, SpeedTester, runSpeedTest, type SpeedProgress } from '@netgauge/core';

/**
 * A miniature version of the production speed server (apps/web/src/app/api/speed)
 * so the engine is exercised end-to-end over real sockets, not mocks.
 */
class TestSpeedServer {
  private server: Server | null = null;
  baseUrl = '';
  downloadRequests = 0;
  maxConcurrentDownloads = 0;
  private concurrent = 0;
  uploadBytes = 0;
  failDownloads = false;

  async start(): Promise<void> {
    const chunk = new Uint8Array(64 * 1024).fill(0x5a);
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/speed/ping') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: true, t: Date.now() }));
        return;
      }
      if (url.pathname === '/api/speed/meta') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ name: 'Vitest Node', location: 'localhost', isp: 'loopback' }));
        return;
      }
      if (url.pathname === '/api/speed/download') {
        if (this.failDownloads) {
          res.writeHead(500).end('nope');
          return;
        }
        const total = Math.min(Number(url.searchParams.get('bytes') ?? 0), 64 * 1024 * 1024);
        this.downloadRequests += 1;
        this.concurrent += 1;
        this.maxConcurrentDownloads = Math.max(this.maxConcurrentDownloads, this.concurrent);
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': String(total),
          'cache-control': 'no-store',
        });
        let sent = 0;
        const pump = () => {
          let ok = true;
          while (sent < total && ok) {
            const n = Math.min(chunk.length, total - sent);
            ok = res.write(n === chunk.length ? chunk : chunk.subarray(0, n));
            sent += n;
          }
          if (sent >= total) {
            this.concurrent -= 1;
            res.end();
          } else {
            res.once('drain', pump);
          }
        };
        pump();
        res.on('close', () => {
          if (sent < total) this.concurrent -= 1;
        });
        return;
      }
      if (url.pathname === '/api/speed/upload') {
        let n = 0;
        req.on('data', (c: Buffer) => {
          n += c.length;
        });
        req.on('end', () => {
          this.uploadBytes += n;
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ received: n }));
        });
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    const address = this.server?.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = null;
  }
}

const FAST_OPTIONS = { phaseDurationMs: 700, concurrency: 3, pingCount: 5 };

describe('SpeedTester against a live server', () => {
  let server: TestSpeedServer;

  beforeEach(async () => {
    server = new TestSpeedServer();
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('measures latency, download and upload', async () => {
    const phases: string[] = [];
    const handle = runSpeedTest({
      baseUrl: server.baseUrl,
      ...FAST_OPTIONS,
      onProgress: (p: SpeedProgress) => {
        if (phases[phases.length - 1] !== p.phase) phases.push(p.phase);
      },
    });
    const result = await handle.promise;

    expect(phases).toEqual(['idle', 'latency', 'download', 'upload', 'done']);
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(result.jitterMs).toBeGreaterThanOrEqual(0);
    expect(result.downBps).toBeGreaterThan(0);
    expect(result.upBps).toBeGreaterThan(0);
    expect(result.bytesDown).toBeGreaterThan(0);
    expect(result.bytesUp).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.server.name).toBe('Vitest Node');
    expect(result.downloadSeries.length).toBeGreaterThan(2);
    expect(result.uploadSeries.length).toBeGreaterThan(0);
    expect(result.lossPercent).toBe(0);
  });

  it('opens parallel streams so slow-start does not cap the result', async () => {
    await new SpeedTester({ baseUrl: server.baseUrl, ...FAST_OPTIONS }).promise;
    expect(server.downloadRequests).toBeGreaterThan(3);
    expect(server.maxConcurrentDownloads).toBeGreaterThan(1);
    expect(server.uploadBytes).toBeGreaterThan(0);
  });

  it('reports progress with sane bounds while running', async () => {
    const progress: SpeedProgress[] = [];
    await new SpeedTester({
      baseUrl: server.baseUrl,
      ...FAST_OPTIONS,
      onProgress: (p) => progress.push(p),
    }).promise;

    expect(progress.length).toBeGreaterThan(5);
    for (const p of progress) {
      expect(p.progress).toBeGreaterThanOrEqual(0);
      expect(p.progress).toBeLessThanOrEqual(1);
      expect(p.phaseProgress).toBeGreaterThanOrEqual(0);
      expect(p.phaseProgress).toBeLessThanOrEqual(1.0001);
    }
    expect(progress[progress.length - 1]?.phase).toBe('done');
  });

  it('can be aborted mid-test', async () => {
    const handle = runSpeedTest({ baseUrl: server.baseUrl, phaseDurationMs: 30_000, concurrency: 2, pingCount: 4 });
    setTimeout(() => handle.abort(), 150);
    await expect(handle.promise).rejects.toBeInstanceOf(SpeedTestAborted);
  });

  it('surfaces a broken endpoint instead of silently reporting zero', async () => {
    server.failDownloads = true;
    await expect(
      new SpeedTester({ baseUrl: server.baseUrl, ...FAST_OPTIONS, skipLatency: true }).promise,
    ).rejects.toThrow(/HTTP 500/);
  });

  it('reports an unreachable server clearly', async () => {
    await expect(
      new SpeedTester({ baseUrl: 'http://127.0.0.1:1', ...FAST_OPTIONS, pingCount: 3 }).promise,
    ).rejects.toBeInstanceOf(Error);
  });
});
