import { jitterMs, mean, min, steadyStateBps } from '../stats';
import { DEFAULTS, DEFAULT_PATHS, type ServerMeta, type SpeedProgress, type SpeedTestOptions, type SpeedTestResult } from './types';

interface MeterSample {
  t: number;
  bytes: number;
}

/** Cumulative byte counter with time stamps; shared by every parallel stream. */
class Meter {
  private bytes = 0;
  readonly samples: MeterSample[] = [];

  constructor(private readonly now: () => number) {
    this.samples.push({ t: now(), bytes: 0 });
  }

  add(chunkBytes: number): void {
    this.bytes += chunkBytes;
    const last = this.samples[this.samples.length - 1];
    const t = this.now();
    // Keep the series small: one sample per ~40 ms of wall clock.
    if (!last || t - last.t >= 40) this.samples.push({ t, bytes: this.bytes });
    else last.bytes = this.bytes;
  }

  total(): number {
    return this.bytes;
  }

  /** Instantaneous rate over the trailing window, in bits/second. */
  instant(windowMs = 750): number {
    const now = this.now();
    const cutoff = now - windowMs;
    const anchor = this.samples.find((s) => s.t >= cutoff) ?? this.samples[0];
    if (!anchor) return 0;
    const dt = (now - anchor.t) / 1000;
    if (dt <= 0.02) return 0;
    return ((this.bytes - anchor.bytes) / dt) * 8;
  }

  steady(warmupFraction: number): number {
    return steadyStateBps(this.samples, warmupFraction);
  }

  /** Per-tick rates for the results sparkline. */
  series(): number[] {
    const out: number[] = [];
    for (let i = 1; i < this.samples.length; i += 1) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      if (!a || !b) continue;
      const dt = (b.t - a.t) / 1000;
      if (dt <= 0) continue;
      out.push(((b.bytes - a.bytes) / dt) * 8);
    }
    return out;
  }
}

export class SpeedTestAborted extends Error {
  constructor() {
    super('Speed test aborted');
    this.name = 'SpeedTestAborted';
  }
}

export interface SpeedTestHandle {
  promise: Promise<SpeedTestResult>;
  abort: () => void;
}

/**
 * A Speedtest-style measurement against any server that implements the four
 * `/api/speed/*` endpoints (see apps/web/src/app/api/speed). Works unchanged in a
 * browser and in Node/Electron because it only needs `fetch`.
 */
export class SpeedTester {
  private readonly controller = new AbortController();
  private aborted = false;
  readonly promise: Promise<SpeedTestResult>;

  constructor(private readonly options: SpeedTestOptions = {}) {
    this.promise = this.run();
  }

  abort(): void {
    this.aborted = true;
    this.controller.abort();
  }

  private get now(): () => number {
    return this.options.now ?? (() => Date.now());
  }

  private get doFetch(): typeof fetch {
    return this.options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  }

  private get paths() {
    return { ...DEFAULT_PATHS, ...(this.options.paths ?? {}) };
  }

  private get base(): string {
    return (this.options.baseUrl ?? '').replace(/\/+$/, '');
  }

  private get signal(): AbortSignal {
    if (!this.options.signal) return this.controller.signal;
    const merged = new AbortController();
    const fail = () => merged.abort();
    if (this.options.signal.aborted) fail();
    else this.options.signal.addEventListener('abort', fail, { once: true });
    this.controller.signal.addEventListener('abort', fail, { once: true });
    return merged.signal;
  }

  private emit(progress: Partial<SpeedProgress> & { phase: SpeedProgress['phase'] }): void {
    this.options.onProgress?.({
      progress: 0,
      phaseProgress: 0,
      downBps: 0,
      upBps: 0,
      bytesDown: 0,
      bytesUp: 0,
      ...progress,
    });
  }

  private async run(): Promise<SpeedTestResult> {
    const startedAt = this.now();
    const phaseMs = this.options.phaseDurationMs ?? DEFAULTS.phaseDurationMs;
    const total = phaseMs * 2 + (this.options.skipLatency ? 0 : 1500);
    let elapsed = 0;

    const state: SpeedProgress = {
      phase: 'idle',
      progress: 0,
      phaseProgress: 0,
      downBps: 0,
      upBps: 0,
      bytesDown: 0,
      bytesUp: 0,
    };
    let lastEmit = 0;
    this.emit({ ...state, message: 'Preparing' });
    const emitThrottled = (patch: Partial<SpeedProgress>) => {
      Object.assign(state, patch);
      state.progress = Math.min(1, elapsed / total);
      const t = this.now();
      if (t - lastEmit >= DEFAULTS.progressIntervalMs || patch.phase === 'done' || patch.phase === 'error') {
        lastEmit = t;
        this.emit({ ...state });
      }
    };

    let latencyMs = 0;
    let jitter = 0;
    let meanLatency = 0;
    let lossPercent = 0;

    try {
      if (!this.options.skipLatency) {
        state.phase = 'latency';
        this.emit({ ...state, message: 'Measuring latency' });
        const ping = await this.measureLatency(emitThrottled);
        latencyMs = ping.min;
        jitter = ping.jitter;
        meanLatency = ping.mean;
        lossPercent = ping.lossPercent;
        elapsed += 1500;
      }

      state.phase = 'download';
      const down = await this.measureTransfer('download', phaseMs, (progress) => {
        emitThrottled({ ...progress, latencyMs, jitterMs: jitter, bytesDown: progress.bytes });
        elapsed = 1500 + progress.phaseProgress * phaseMs;
      });

      state.phase = 'upload';
      const up = await this.measureTransfer('upload', phaseMs, (progress) => {
        emitThrottled({
          ...progress,
          downBps: down.bps,
          latencyMs,
          jitterMs: jitter,
          bytesDown: down.bytes,
          bytesUp: progress.bytes,
        });
        elapsed = 1500 + phaseMs + progress.phaseProgress * phaseMs;
      });

      const result: SpeedTestResult = {
        downBps: down.bps,
        upBps: up.bps,
        latencyMs,
        jitterMs: jitter,
        meanLatencyMs: meanLatency,
        lossPercent,
        bytesDown: down.bytes,
        bytesUp: up.bytes,
        durationMs: this.now() - startedAt,
        startedAt,
        server: await this.safeMeta(),
        downloadSeries: down.series,
        uploadSeries: up.series,
      };
      this.emit({
        phase: 'done',
        progress: 1,
        phaseProgress: 1,
        downBps: result.downBps,
        upBps: result.upBps,
        latencyMs,
        jitterMs: jitter,
        bytesDown: result.bytesDown,
        bytesUp: result.bytesUp,
      });
      return result;
    } catch (error) {
      if (this.aborted || (error instanceof Error && error.name === 'AbortError')) throw new SpeedTestAborted();
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ phase: 'error', message, progress: state.progress, phaseProgress: 0, downBps: 0, upBps: 0, bytesDown: 0, bytesUp: 0 });
      throw error;
    }
  }

  private async safeMeta(): Promise<ServerMeta> {
    const fallback: ServerMeta = { baseUrl: this.base };
    try {
      const res = await this.doFetch(`${this.base}${this.paths.meta}`, {
        cache: 'no-store',
        signal: this.signal,
      });
      if (!res.ok) return fallback;
      const json = (await res.json()) as Partial<ServerMeta>;
      return { ...fallback, ...json };
    } catch {
      return fallback;
    }
  }

  private async measureLatency(onUpdate: (p: Partial<SpeedProgress>) => void): Promise<{
    min: number;
    mean: number;
    jitter: number;
    lossPercent: number;
  }> {
    const count = Math.max(3, this.options.pingCount ?? DEFAULTS.pingCount);
    const rtts: number[] = [];
    let failures = 0;
    for (let i = 0; i < count; i += 1) {
      const t0 = this.now();
      try {
        const res = await this.doFetch(`${this.base}${this.paths.ping}?r=${Math.random().toString(36).slice(2)}`, {
          cache: 'no-store',
          signal: this.signal,
        });
        await res.arrayBuffer();
        const rtt = this.now() - t0;
        // First probe pays for DNS/TLS/connection setup — keep it out of the numbers.
        if (i > 0 && Number.isFinite(rtt)) rtts.push(rtt);
      } catch {
        failures += 1;
      }
      onUpdate({ phaseProgress: (i + 1) / count });
    }
    return {
      min: rtts.length ? min(rtts) : 0,
      mean: rtts.length ? mean(rtts) : 0,
      jitter: jitterMs(rtts),
      lossPercent: (failures / count) * 100,
    };
  }

  private async measureTransfer(
    direction: 'download' | 'upload',
    durationMs: number,
    onUpdate: (p: { phaseProgress: number; bps: number; bytes: number }) => void,
  ): Promise<{ bps: number; bytes: number; series: number[] }> {
    const meter = new Meter(this.now);
    const concurrency = Math.max(1, this.options.concurrency ?? DEFAULTS.concurrency);
    const deadline = this.now() + durationMs;
    const warmupFraction = this.options.warmupFraction ?? DEFAULTS.warmupFraction;
    const ramp = [...DEFAULTS.chunkRamp];

    const workers = Array.from({ length: concurrency }, (_, id) =>
      direction === 'download'
        ? this.downloadWorker(meter, deadline, ramp, id)
        : this.uploadWorker(meter, deadline, ramp, id),
    );

    const ticker = setInterval(() => {
      onUpdate({
        phaseProgress: Math.min(1, (this.now() - (deadline - durationMs)) / durationMs),
        bps: meter.instant(),
        bytes: meter.total(),
      });
    }, DEFAULTS.progressIntervalMs);

    let workerError: unknown = null;
    try {
      const settled = await Promise.allSettled(workers);
      workerError = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason ?? null;
    } finally {
      clearInterval(ticker);
    }

    if (this.aborted) throw new SpeedTestAborted();
    if (meter.total() === 0) {
      // Surface the real HTTP/network error rather than a vague "no data" message.
      if (workerError instanceof Error && !(workerError.name === 'AbortError')) throw workerError;
      throw new Error(
        direction === 'download'
          ? 'Download test transferred no data — is the speed server reachable?'
          : 'Upload test transferred no data — is the speed server reachable?',
      );
    }

    return { bps: meter.steady(warmupFraction), bytes: meter.total(), series: meter.series() };
  }

  private async downloadWorker(
    meter: Meter,
    deadline: number,
    ramp: readonly number[],
    workerId: number,
  ): Promise<void> {
    let step = workerId % ramp.length;
    while (this.now() < deadline && !this.aborted) {
      const bytes = ramp[Math.min(step, ramp.length - 1)] ?? DEFAULTS.chunkRamp[0]!;
      step += 1;
      const url = `${this.base}${this.paths.download}?bytes=${bytes}&r=${Math.random().toString(36).slice(2)}`;
      const res = await this.doFetch(url, { cache: 'no-store', signal: this.signal });
      if (!res.ok || !res.body) throw new Error(`Download endpoint returned HTTP ${res.status}`);
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          meter.add(value?.byteLength ?? 0);
          if (this.now() >= deadline) break;
        }
      } finally {
        reader.cancel().catch(() => undefined);
      }
    }
  }

  private readonly payloadCache = new Map<number, Uint8Array>();

  private payload(size: number): Uint8Array {
    const cached = this.payloadCache.get(size);
    if (cached) return cached;
    const buf = new Uint8Array(size);
    // Avoid all-zero bodies: some proxies/CDNs compress them into nothing.
    for (let i = 0; i < size; i += 4096) buf[i] = (i & 0xff) || 0x5a;
    this.payloadCache.set(size, buf);
    return buf;
  }

  private async uploadWorker(
    meter: Meter,
    deadline: number,
    ramp: readonly number[],
    workerId: number,
  ): Promise<void> {
    let step = workerId % ramp.length;
    while (this.now() < deadline && !this.aborted) {
      const size = ramp[Math.min(step, ramp.length - 1)] ?? DEFAULTS.chunkRamp[0]!;
      step += 1;
      const body = this.payload(size);
      const res = await this.doFetch(`${this.base}${this.paths.upload}`, {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/octet-stream', 'content-length': String(size) },
        cache: 'no-store',
        signal: this.signal,
      } as RequestInit);
      if (!res.ok) throw new Error(`Upload endpoint returned HTTP ${res.status}`);
      await res.arrayBuffer();
      meter.add(size);
    }
  }
}

/** Convenience wrapper: `runSpeedTest({...}).then(result => ...)` */
export function runSpeedTest(options?: SpeedTestOptions): SpeedTestHandle {
  const tester = new SpeedTester(options);
  // Bound, so callers can destructure `const { promise, abort } = runSpeedTest(...)`.
  return { promise: tester.promise, abort: () => tester.abort() };
}
