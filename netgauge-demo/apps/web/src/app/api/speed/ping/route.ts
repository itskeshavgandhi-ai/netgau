export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Latency probe. Deliberately the smallest possible response so the round trip is
 * dominated by network latency rather than payload transfer.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
} as const;

/** The desktop app measures against this API cross-origin. */
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, 'cache-control': 'no-store' } });
}

export function GET() {
  const body = '{"pong":true}';
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(body.length),
      'cache-control': 'no-store',
      ...CORS,
    },
  });
}
