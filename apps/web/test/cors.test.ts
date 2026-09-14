import { describe, expect, it } from 'vitest';

/**
 * Verifies the desktop app can measure against this API cross-origin.
 * Runs only when NETGAUGE_E2E_URL points at a server built from current code.
 */
const baseUrl = process.env.NETGAUGE_E2E_URL;

describe.skipIf(!baseUrl)('speed API CORS headers', () => {
  it('answers OPTIONS preflights with a wildcard origin', async () => {
    const res = await fetch(`${baseUrl}/api/speed/upload`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('allows a cross-origin POST upload', async () => {
    const res = await fetch(`${baseUrl}/api/speed/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', origin: 'app://netgauge' },
      body: new Uint8Array(1024),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const json = (await res.json()) as { received: number };
    expect(json.received).toBe(1024);
  });

  it('exposes the wildcard on the download stream too', async () => {
    const res = await fetch(`${baseUrl}/api/speed/download?bytes=1024`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    await res.body?.cancel();
  });
});
