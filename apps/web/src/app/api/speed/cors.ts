/**
 * Shared response headers for the speed API.
 *
 * `Timing-Allow-Origin` matters more than it looks: without it the browser zeroes
 * out `PerformanceResourceTiming` for cross-origin responses, which is exactly the
 * API a speed test uses to read time-to-first-byte latency. The desktop app measures
 * against this server from a different origin, so the header is required for the
 * latency numbers to be real rather than "0 ms".
 */
export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
  'timing-allow-origin': '*',
  'cache-control': 'no-store',
} as const;

export function preflight(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
}
