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
}

export interface SpeedTestResult {
  downBps: number;
  upBps: number;
  /** Best (lowest) RTT observed during the latency phase. */
  latencyMs: number;
  jitterMs: number;
  /** Mean RTT, for people who prefer it. */
  meanLatencyMs: number;
  lossPercent: number;
  bytesDown: number;
  bytesUp: number;
  durationMs: number;
  startedAt: number;
  server: ServerMeta;
  /** Per-tick throughput samples, useful for the "your line fluctuated" note. */
  downloadSeries: number[];
  uploadSeries: number[];
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
  /** Chunk sizes each stream walks through, 1 MiB → 32 MiB. */
  chunkRamp: [1, 2, 4, 8, 16, 32].map((mb) => mb * 1024 * 1024),
  /** Progress callbacks are throttled to this cadence. */
  progressIntervalMs: 100,
} as const;
