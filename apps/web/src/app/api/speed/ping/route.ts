import { CORS_HEADERS, preflight } from '../cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The desktop app measures against this API cross-origin. */
export function OPTIONS() {
  return preflight();
}

/**
 * Latency probe. Deliberately the smallest possible response so the round trip is
 * dominated by network latency rather than payload transfer — a speed test measures
 * this as time-to-first-byte, so every byte here is a byte of measurement error.
 */
export function GET() {
  return new Response('{"pong":true}', {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-length': '13',
      ...CORS_HEADERS,
    },
  });
}
