import { CORS_HEADERS, preflight } from '../cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The desktop app measures against this API cross-origin. */
export function OPTIONS() {
  return preflight();
}

/**
 * Upload endpoint: drains the request body and echoes how many bytes landed.
 *
 * Streaming (rather than `await request.arrayBuffer()`) keeps memory flat while the
 * client measures how fast it can push. The body is deliberately *not* buffered, so
 * a 32 MiB request costs a few kilobytes of RAM on the server.
 */
export async function POST(request: Request) {
  if (!request.body) {
    return Response.json({ received: 0 }, { headers: { ...CORS_HEADERS } });
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
    { headers: { 'content-type': 'application/json', ...CORS_HEADERS } },
  );
}
