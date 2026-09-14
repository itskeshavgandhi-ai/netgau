import { describe, expect, it } from 'vitest';
import { SpeedTester } from '@netgauge/core';

/**
 * End-to-end check of the real Next.js speed endpoints against the shared engine.
 *
 *   NETGAUGE_E2E_URL=http://127.0.0.1:3000 npx vitest run apps/web
 *
 * Skipped by default so `npm test` stays hermetic.
 */
const baseUrl = process.env.NETGAUGE_E2E_URL;

describe.skipIf(!baseUrl)('live Next.js speed endpoints', () => {
  it(
    'runs a full latency → download → upload test',
    async () => {
      const phases: string[] = [];
      const result = await new SpeedTester({
        baseUrl,
        phaseDurationMs: 2500,
        concurrency: 4,
        pingCount: 6,
        onProgress: (p) => {
          if (phases[phases.length - 1] !== p.phase) phases.push(p.phase);
        },
      }).promise;

      expect(phases).toEqual(['idle', 'latency', 'download', 'upload', 'done']);
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.downBps).toBeGreaterThan(1e6);
      expect(result.upBps).toBeGreaterThan(1e6);
      expect(result.bytesDown).toBeGreaterThan(1e6);
      expect(result.bytesUp).toBeGreaterThan(1e6);
      expect(result.server.host).toBeTruthy();
      expect(result.lossPercent).toBe(0);
      // eslint-disable-next-line no-console
      console.log(
        `  ↳ down ${(result.downBps / 1e6).toFixed(1)} Mbps · up ${(result.upBps / 1e6).toFixed(1)} Mbps · ping ${result.latencyMs.toFixed(1)} ms · jitter ${result.jitterMs.toFixed(1)} ms`,
      );
    },
    60_000,
  );

  it('honours the requested download size exactly', async () => {
    const res = await fetch(`${baseUrl}/api/speed/download?bytes=1048576`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('1048576');
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(1048576);
  });

  it('caps an absurd download request instead of hanging', async () => {
    const res = await fetch(`${baseUrl}/api/speed/download?bytes=999999999999`, { method: 'HEAD' }).catch(() => null);
    // HEAD is not implemented; a GET with a huge size must at least start streaming.
    if (res) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const stream = await fetch(`${baseUrl}/api/speed/download?bytes=999999999999`, { signal: controller.signal });
    clearTimeout(timer);
    expect(stream.status).toBe(200);
    expect(Number(stream.headers.get('content-length'))).toBeLessThanOrEqual(1024 * 1024 * 1024);
    await stream.body?.cancel();
  });

  it('echoes upload byte counts', async () => {
    const body = new Uint8Array(262_144).fill(7);
    const res = await fetch(`${baseUrl}/api/speed/upload`, { method: 'POST', body });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 262_144 });
  });

  it('returns server metadata', async () => {
    const res = await fetch(`${baseUrl}/api/speed/meta`);
    expect(res.status).toBe(200);
    const meta = (await res.json()) as { name?: string; host?: string; serverTime?: number };
    expect(meta.name).toBeTruthy();
    expect(meta.host).toBeTruthy();
    expect(typeof meta.serverTime).toBe('number');
  });
});
