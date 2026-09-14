import { CORS_HEADERS, preflight } from '../cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHUNK = 64 * 1024;
const DEFAULT_BYTES = 32 * 1024 * 1024;
const MAX_BYTES = 1024 * 1024 * 1024;
/**
 * Chunks held in the queue before the stream waits for the consumer. The default of
 * one chunk means a promise round-trip per 64 KiB, which caps throughput on fast
 * links; four keeps ~256 KiB in flight while still respecting backpressure.
 */
const QUEUE_CHUNKS = 4;

/** The desktop app measures against this API cross-origin. */
export function OPTIONS() {
  return preflight();
}

/**
 * Download endpoint: streams exactly `bytes` of incompressible payload.
 *
 * The chunk buffer is filled with pseudo-random bytes rather than zeros so no
 * intermediary can compress the response and inflate the measured throughput, and
 * `content-length` is always exact so the client can verify what it received.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get('bytes') ?? DEFAULT_BYTES);
  const total = Math.max(
    CHUNK,
    Math.min(MAX_BYTES, Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_BYTES),
  );

  // One template chunk, copied per enqueue so the consumer never sees a buffer that
  // is about to be reused.
  const template = new Uint8Array(CHUNK);
  let seed = 0x9e3779b9;
  for (let i = 0; i < template.length; i += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    template[i] = seed & 0xff;
  }

  let sent = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        // Respect backpressure: only enqueue while the consumer is ready.
        while (controller.desiredSize === null || controller.desiredSize > 0) {
          if (sent >= total) {
            controller.close();
            return;
          }
          const size = Math.min(CHUNK, total - sent);
          const next = new Uint8Array(size);
          next.set(size === CHUNK ? template : template.subarray(0, size));
          controller.enqueue(next);
          sent += size;
        }
      },
      cancel() {
        sent = total;
      },
    },
    { highWaterMark: QUEUE_CHUNKS },
  );

  return new Response(stream, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(total),
      'content-encoding': 'identity',
      'x-content-type-options': 'nosniff',
      ...CORS_HEADERS,
    },
  });
}
