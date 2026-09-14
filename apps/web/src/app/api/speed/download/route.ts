export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHUNK = 64 * 1024;
const DEFAULT_BYTES = 32 * 1024 * 1024;
const MAX_BYTES = 1024 * 1024 * 1024;

/**
 * Download endpoint: streams exactly `bytes` of incompressible payload.
 *
 * The chunk buffer is filled with pseudo-random bytes rather than zeros so no
 * intermediary can compress the response and inflate the measured throughput.
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

export function GET(request: Request) {
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get('bytes') ?? DEFAULT_BYTES);
  const total = Math.max(
    CHUNK,
    Math.min(MAX_BYTES, Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_BYTES),
  );

  const chunk = new Uint8Array(CHUNK);
  // Cheap deterministic PRNG — fast to fill, high entropy, no external dependency.
  let seed = 0x9e3779b9;
  for (let i = 0; i < chunk.length; i += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    chunk[i] = seed & 0xff;
  }

  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      // Respect backpressure: only enqueue while the consumer is ready.
      while (controller.desiredSize === null || controller.desiredSize > 0) {
        if (sent >= total) {
          controller.close();
          return;
        }
        const size = Math.min(CHUNK, total - sent);
        controller.enqueue(size === CHUNK ? new Uint8Array(chunk) : new Uint8Array(chunk.subarray(0, size)));
        sent += size;
      }
    },
    cancel() {
      sent = total;
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(total),
      'cache-control': 'no-store',
      'content-encoding': 'identity',
      'x-content-type-options': 'nosniff',
      ...CORS,
    },
  });
}
