import type { BufferbloatGrade } from '../stats';
export interface ServerMeta {
  /** Base URL the test ran against ('' = same origin). */
  baseUrl: string;
  host?: string;
  name?: string;
  location?: string;
  country?: string;
  ip?: string;
  isp?: string;
  /** Server-reported time, used to sanity-check clock skew. */
  serverTime?: number;
}

export type SpeedPhase = 'idle' | 'latency' | 'download' | 'upload' | 'done' | 'error';

export interface SpeedProgress {
  phase: SpeedPhase;
  /** 0..1 across the whole test. */
  progress: number;
  /** 0..1 within the current phase. */
  phaseProgress: number;
  downBps: number;
  upBps: number;
  latencyMs?: number;
  jitterMs?: number;
  bytesDown: number;
  bytesUp: number;
  message?: string;
  /** Live "latency under load" reading, once a saturated probe has answered. */
  loadedLatencyMs?: number;
  /** Bytes transferred by the whole test so far (down + up). */
  totalBytes?: number;
}

export interface SpeedTestResult {
  downBps: number;
  upBps: number;
  /** Best (lowest) RTT observed during the latency phase. */
  latencyMs: number;
  jitterMs: number;
  /** Mean RTT, for people who prefer it. */
  meanLatencyMs: number;
  /** Median RTT — the value Cloudflare's test reports. */
  medianLatencyMs: number;
  lossPercent: number;
  bytesDown: number;
  bytesUp: number;
  durationMs: number;
  startedAt: number;
  server: ServerMeta;
  /** Per-tick throughput samples, useful for the "your line fluctuated" note. */
  downloadSeries: number[];
  uploadSeries: number[];
  /**
   * 90th percentile of the per-sample rates inside the steady window. Cloudflare's
   * public test reports exactly this number; Ookla reports something close to it.
   * Reported alongside `downBps` so a single measurement can be read both ways.
   */
  downBpsP90: number;
  upBpsP90: number;
  downBpsMedian: number;
  upBpsMedian: number;
  /** Every idle RTT probe, including the discarded warm-up one. */
  latencySeries: number[];
  /** RTT probes fired *while* the link was saturated — the bufferbloat signal. */
  loadedDownLatencyMs: number;
  loadedUpLatencyMs: number;
  loadedDownLatencySeries: number[];
  loadedUpLatencySeries: number[];
  /** max(loaded) − idle, in ms. Also called "added latency under load". */
  bufferbloatMs: number;
  bufferbloatGrade: BufferbloatGrade;
  /** How the numbers were obtained, so the UI can explain itself. */
  method: SpeedTestMethod;
}

export interface SpeedTestMethod {
  engine: 'netgauge';
  concurrency: number;
  phaseDurationMs: number;
  warmupFraction: number;
  pingCount: number;
  /** Wire-level details worth surfacing in the results panel. */
  adaptiveChunks: boolean;
  minChunkBytes: number;
  maxChunkBytes: number;
  uploadMetering: 'xhr-progress' | 'request-completion';
  loadedLatency: boolean;
}

export interface SpeedTestOptions {
  /** Origin + path prefix of the test server. '' means same origin. */
  baseUrl?: string;
  /** Endpoint overrides, mainly for tests and self-hosted mirrors. */
  paths?: { ping?: string; download?: string; upload?: string; meta?: string };
  /** How long each of the download and upload phases runs, in ms. */
  phaseDurationMs?: number;
  /** Parallel streams. 4–8 saturates most home links. */
  concurrency?: number;
  /** Portion of each phase treated as TCP slow-start and excluded from the result. */
  warmupFraction?: number;
  /** Latency probes (one is discarded as a warm-up). */
  pingCount?: number;
  onProgress?: (progress: SpeedProgress) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Injected clock, for deterministic tests. */
  now?: () => number;
  /** Skip the latency phase (e.g. quick re-test). */
  skipLatency?: boolean;
  /**
   * Fire latency probes while the link is saturated to measure added latency under
   * load (bufferbloat). Runs inside the download/upload phases and never changes the
   * reported phase.
   */
  measureLoadedLatency?: boolean;
  /**
   * Grow/shrink each request so it lasts roughly `targetRequestMs`. Short requests
   * mean the byte meter gets frequent updates, which is what makes the live number
   * and the upload measurement accurate on fast links.
   */
  adaptiveChunks?: boolean;
  targetRequestMs?: number;
  minChunkBytes?: number;
  maxChunkBytes?: number;
  /**
   * Translates a foreign `/meta` payload into the fields NetGauge shows. Cloudflare's
   * `speed.cloudflare.com/meta` returns a completely different shape, for example.
   */
  mapMeta?: (raw: unknown) => Partial<ServerMeta> | null;
}

export const DEFAULT_PATHS = {
  ping: '/api/speed/ping',
  download: '/api/speed/download',
  upload: '/api/speed/upload',
  meta: '/api/speed/meta',
} as const;

export const DEFAULTS = {
  phaseDurationMs: 10_000,
  concurrency: 6,
  warmupFraction: 0.2,
  pingCount: 9,
  /** Adaptive request sizing, in bytes. 256 KiB → 32 MiB. */
  minChunkBytes: 256 * 1024,
  maxChunkBytes: 32 * 1024 * 1024,
  targetRequestMs: 1000,
  /** Progress callbacks are throttled to this cadence. */
  progressIntervalMs: 100,
  /** Latency probe cadence while the link is saturated. */
  loadedLatencyIntervalMs: 350,
} as const;
