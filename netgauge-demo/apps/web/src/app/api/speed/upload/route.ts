export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Upload endpoint: drains the request body and echoes how many bytes landed.
 * Streaming (rather than `await request.arrayBuffer()`) keeps memory flat while
 * the client measures how fast it can push.
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

export async function POST(request: Request) {
  if (!request.body) {
    return Response.json({ received: 0 }, { headers: { 'cache-control': 'no-store' } });
  }

  let received = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value?.byteLength ?? 0;
  }

  return Response.json(
    { received },
    {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        ...CORS,
      },
    },
  );
}
