import {
  bufferbloatGrade,
  jitterMs,
  max,
  mean,
  median,
  min,
  percentile,
  steadyStateBps,
  type BufferbloatGrade,
} from '../stats';
import { DEFAULTS, DEFAULT_PATHS, type ServerMeta, type SpeedProgress, type SpeedTestOptions, type SpeedTestResult } from './types';

interface MeterSample {
  t: number;
  bytes: number;
}

/**
 * Cumulative byte counter with timestamps, shared by every parallel stream.
 *
 * Everything the result depends on comes from here: the steady-state rate is the
 * byte delta over the trailing portion of the window, and the instantaneous rate is
 * the byte delta over a short trailing window. Both are *byte* measurements, not
 * "bytes so far ÷ time since the test started", which is what makes a speed test
 * report the sustained rate rather than a slow-start average.
 */
export class Meter {
  private bytes = 0;
  readonly samples: MeterSample[] = [];

  constructor(private readonly now: () => number) {
    this.samples.push({ t: now(), bytes: 0 });
  }

  add(chunkBytes: number): void {
    if (!Number.isFinite(chunkBytes) || chunkBytes <= 0) return;
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

  /**
   * Close the series with an accurate final timestamp. Without this the last sample
   * keeps the timestamp of the previous chunk, so the measured window is short and
   * the rate comes out too high.
   */
  flush(): void {
    const t = this.now();
    const last = this.samples[this.samples.length - 1];
    if (last && last.t === t) return;
    this.samples.push({ t, bytes: this.bytes });
  }

  /**
   * Instantaneous rate over the trailing window, in bits/second. The anchor is the
   * newest sample *at or before* the cutoff so the window really is `windowMs` long
   * (anchoring on the first sample *after* the cutoff would shrink it and add noise).
   */
  instant(windowMs = 500): number {
    const now = this.now();
    const cutoff = now - windowMs;
    let anchor: MeterSample | undefined = this.samples[0];
    for (const sample of this.samples) {
      if (sample.t <= cutoff) anchor = sample;
      else break;
    }
    if (!anchor) return 0;
    const dt = (now - anchor.t) / 1000;
    if (dt <= 0.05) return 0;
    const dBytes = this.bytes - anchor.bytes;
    if (dBytes <= 0) return 0;
    return (dBytes / dt) * 8;
  }

  steady(warmupFraction: number): number {
    return steadyStateBps(this.samples, warmupFraction);
  }

  /** Per-tick rates for the results sparkline. */
  series(): number[] {
    return ratesBetween(this.samples, 0);
  }

  /**
   * Per-tick rates with the warm-up (TCP slow start) trimmed off the front. Used for
   * the percentile reduction, because a 90th percentile taken over the ramp-up is a
   * number nobody can reproduce with a file transfer.
   */
  steadySeries(warmupFraction: number): number[] {
    const start = this.samples[0];
    const end = this.samples[this.samples.length - 1];
    if (!start || !end) return [];
    const span = end.t - start.t;
    if (span <= 0) return [];
    const fraction = Math.min(Math.max(warmupFraction, 0), 0.9);
    return ratesBetween(this.samples, start.t + span * fraction);
  }

  /** Percentile (0–100) of the steady-window sample rates, in bits/second. */
  steadyPercentile(warmupFraction: number, p: number): number {
    return percentile(this.steadySeries(warmupFraction), p);
  }

  steadyMedian(warmupFraction: number): number {
    return this.steadyPercentile(warmupFraction, 50);
  }
}

function ratesBetween(samples: MeterSample[], fromT: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (!a || !b) continue;
    if (b.t < fromT) continue;
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) continue;
    out.push(((b.bytes - a.bytes) / dt) * 8);
  }
  return out;
}

/**
 * Picks the byte size for the next request so each one lasts roughly
 * `targetRequestMs`. This is the same idea as Ookla's adaptive chunk sizing and
 * Cloudflare's "ramp until the request is long enough" rule: short requests mean the
 * byte meter is fed often (accurate live numbers, accurate upload metering), while
 * long requests avoid per-request overhead dominating the result.
 */
export class ChunkSizer {
  private size: number;
  private readonly min: number;
  private readonly max: number;
  private readonly targetMs: number;
  private readonly enabled: boolean;

  constructor(options: { min?: number; max?: number; targetMs?: number; enabled?: boolean } = {}) {
    this.min = Math.max(64 * 1024, Math.round(options.min ?? DEFAULTS.minChunkBytes));
    this.max = Math.max(this.min, Math.round(options.max ?? DEFAULTS.maxChunkBytes));
    this.targetMs = Math.max(200, options.targetMs ?? DEFAULTS.targetRequestMs);
    this.enabled = options.enabled ?? true;
    // A disabled sizer pins to the maximum from the very first request.
    this.size = this.enabled ? this.min : this.max;
  }

  /** Size to use for the next request, in bytes. */
  next(): number {
    return this.size;
  }

  /** Feed back how long the request took so the next one lands nearer the target. */
  observe(bytes: number, durationMs: number): void {
    if (!this.enabled) {
      this.size = this.max;
      return;
    }
    if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(durationMs) || durationMs <= 0) return;
    if (durationMs < this.targetMs * 0.6) {
      this.size = Math.min(this.max, this.size * 2);
    } else if (durationMs > this.targetMs * 1.6) {
      // Halve, but never below what the request actually managed to move.
      this.size = Math.max(this.min, Math.min(Math.floor(this.size / 2), bytes));
    }
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

interface TransferOutcome {
  bps: number;
  p90: number;
  median: number;
  bytes: number;
  series: number[];
  loadedLatencyMs: number;
  loadedLatencySeries: number[];
  requests: number;
}

/**
 * A Speedtest-class measurement against any server that implements the four
 * `/api/speed/*` endpoints (see apps/web/src/app/api/speed). Works unchanged in a
 * browser and in Node/Electron because it only needs `fetch`, `AbortController` and
 * (where available) `XMLHttpRequest`.
 *
 * Method, in one paragraph: nine latency probes (first discarded, best-of kept),
 * then a saturated download phase and a saturated upload phase built from
 * `concurrency` parallel streams sized adaptively so every request lasts about a
 * second. A shared byte meter records the cumulative total every 40 ms; the
 * reported figure is total bytes ÷ elapsed time over the last 80% of the window
 * (the first 20% is TCP slow start), and the 90th percentile of the same samples is
 * reported next to it. Latency probes keep firing during both transfer phases so
 * the results can also say how much latency the load added.
 */
export class SpeedTester {
  private readonly controller = new AbortController();
  private aborted = false;
  readonly promise: Promise<SpeedTestResult>;
  private lastLoadedLatency = 0;
  private lastTotalBytes = 0;

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

  private mergedSignal: AbortSignal | null = null;

  /**
   * The internal controller merged with the caller's signal. Built once and cached —
   * a fresh merged controller per request would attach a new listener to the source
   * signal every time and leak them across a long test.
   */
  private get signal(): AbortSignal {
    const external = this.options.signal;
    if (!external) return this.controller.signal;
    if (this.mergedSignal) return this.mergedSignal;
    const merged = new AbortController();
    const fail = () => merged.abort();
    if (external.aborted) fail();
    else external.addEventListener('abort', fail, { once: true });
    this.controller.signal.addEventListener('abort', fail, { once: true });
    this.mergedSignal = merged.signal;
    return this.mergedSignal;
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
    const phaseMs = Math.max(500, this.options.phaseDurationMs ?? DEFAULTS.phaseDurationMs);
    const latencyBudgetMs = this.options.skipLatency ? 0 : 1500;
    const total = phaseMs * 2 + latencyBudgetMs;
    let elapsed = latencyBudgetMs;

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
      state.progress = Math.min(1, Math.max(0, elapsed / total));
      const t = this.now();
      if (t - lastEmit >= DEFAULTS.progressIntervalMs || patch.phase === 'done' || patch.phase === 'error') {
        lastEmit = t;
        this.emit({ ...state });
      }
    };

    let latencyMs = 0;
    let jitter = 0;
    let meanLatency = 0;
    let medianLatency = 0;
    let latencySeries: number[] = [];
    let lossPercent = 0;

    try {
      if (!this.options.skipLatency) {
        state.phase = 'latency';
        this.emit({ ...state, message: 'Measuring latency' });
        const ping = await this.measureLatency(emitThrottled);
        latencyMs = ping.min;
        jitter = ping.jitter;
        meanLatency = ping.mean;
        medianLatency = ping.median;
        latencySeries = ping.series;
        lossPercent = ping.lossPercent;
        elapsed = latencyBudgetMs;
        emitThrottled({
          phaseProgress: 1,
          latencyMs,
          jitterMs: jitter,
          message: `Ping ${latencyMs.toFixed(0)} ms`,
        });
      }

      state.phase = 'download';
      const down = await this.measureTransfer('download', phaseMs, (progress) => {
        emitThrottled({
          ...progress,
          latencyMs,
          jitterMs: jitter,
          bytesDown: progress.bytes,
          loadedLatencyMs: this.lastLoadedLatency || undefined,
          totalBytes: this.lastTotalBytes,
        });
        elapsed = latencyBudgetMs + progress.phaseProgress * phaseMs;
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
          loadedLatencyMs: this.lastLoadedLatency || undefined,
          totalBytes: down.bytes + progress.bytes,
        });
        elapsed = latencyBudgetMs + phaseMs + progress.phaseProgress * phaseMs;
      });

      const loadedDown = down.loadedLatencyMs;
      const loadedUp = up.loadedLatencyMs;
      const bufferbloatMs = max([loadedDown - latencyMs, loadedUp - latencyMs].filter((v) => Number.isFinite(v)));
      const grade: BufferbloatGrade = latencyMs > 0 && bufferbloatMs > 0 ? bufferbloatGrade(bufferbloatMs) : 'n/a';

      const result: SpeedTestResult = {
        downBps: down.bps,
        upBps: up.bps,
        latencyMs,
        jitterMs: jitter,
        meanLatencyMs: meanLatency,
        medianLatencyMs: medianLatency,
        lossPercent,
        bytesDown: down.bytes,
        bytesUp: up.bytes,
        durationMs: this.now() - startedAt,
        startedAt,
        server: await this.safeMeta(),
        downloadSeries: down.series,
        uploadSeries: up.series,
        downBpsP90: down.p90,
        upBpsP90: up.p90,
        downBpsMedian: down.median,
        upBpsMedian: up.median,
        latencySeries,
        loadedDownLatencyMs: loadedDown,
        loadedUpLatencyMs: loadedUp,
        loadedDownLatencySeries: down.loadedLatencySeries,
        loadedUpLatencySeries: up.loadedLatencySeries,
        bufferbloatMs: bufferbloatMs > 0 ? bufferbloatMs : 0,
        bufferbloatGrade: grade,
        method: {
          engine: 'netgauge',
          concurrency: Math.max(1, this.options.concurrency ?? DEFAULTS.concurrency),
          phaseDurationMs: phaseMs,
          warmupFraction: this.options.warmupFraction ?? DEFAULTS.warmupFraction,
          pingCount: Math.max(3, this.options.pingCount ?? DEFAULTS.pingCount),
          adaptiveChunks: this.options.adaptiveChunks !== false,
          minChunkBytes: this.options.minChunkBytes ?? DEFAULTS.minChunkBytes,
          maxChunkBytes: this.options.maxChunkBytes ?? DEFAULTS.maxChunkBytes,
          uploadMetering: this.hasXhr() ? 'xhr-progress' : 'request-completion',
          loadedLatency: this.options.measureLoadedLatency !== false,
        },
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
        totalBytes: result.bytesDown + result.bytesUp,
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
      const json: unknown = await res.json();
      const mapped = this.options.mapMeta?.(json);
      if (this.options.mapMeta) return { ...fallback, ...(mapped ?? {}) };
      return { ...fallback, ...(json as Partial<ServerMeta>) };
    } catch {
      return fallback;
    }
  }

  /**
   * Appends a query parameter without assuming the path has no query string of its
   * own — Cloudflare's latency probe is literally `/__down?bytes=0`.
   */
  private withParam(path: string, key: string, value: string): string {
    const separator = path.includes('?') ? '&' : '?';
    return `${this.base}${path}${separator}${key}=${value}`;
  }

  private pingUrl(): string {
    return this.withParam(this.paths.ping, 'r', Math.random().toString(36).slice(2));
  }

  /** One RTT probe. Returns the round-trip time in ms, or NaN when it failed. */
  private async probe(): Promise<number> {
    const t0 = this.now();
    try {
      const res = await this.doFetch(this.pingUrl(), { cache: 'no-store', signal: this.signal });
      await res.arrayBuffer();
      const rtt = this.now() - t0;
      return Number.isFinite(rtt) && rtt >= 0 ? rtt : Number.NaN;
    } catch {
      return Number.NaN;
    }
  }

  private async measureLatency(onUpdate: (p: Partial<SpeedProgress>) => void): Promise<{
    min: number;
    mean: number;
    median: number;
    jitter: number;
    lossPercent: number;
    series: number[];
  }> {
    const count = Math.max(3, this.options.pingCount ?? DEFAULTS.pingCount);
    const rtts: number[] = [];
    let failures = 0;
    for (let i = 0; i < count; i += 1) {
      const rtt = await this.probe();
      if (Number.isFinite(rtt)) {
        // The first probe pays for DNS/TLS/connection setup, so it is recorded for
        // the chart but kept out of the statistics (same rule Ookla documents).
        if (i > 0) rtts.push(rtt);
      } else {
        failures += 1;
      }
      onUpdate({ phaseProgress: (i + 1) / count, message: `Probe ${i + 1} of ${count}` });
    }
    return {
      min: rtts.length ? min(rtts) : 0,
      mean: rtts.length ? mean(rtts) : 0,
      median: rtts.length ? median(rtts) : 0,
      jitter: jitterMs(rtts),
      lossPercent: (failures / count) * 100,
      series: rtts,
    };
  }

  /**
   * Keeps firing small probes while the bulk transfer runs. On a link with a full
   * buffer these come back much slower than the idle probes — that difference is the
   * bufferbloat number. Probes never touch the byte meter or the reported phase.
   */
  private startLoadedLatencyProbe(sink: number[], deadline: number): () => void {
    let stopped = false;
    const run = async () => {
      while (!stopped && !this.aborted && this.now() < deadline - 200) {
        const rtt = await this.probe();
        if (Number.isFinite(rtt)) {
          sink.push(rtt);
          this.lastLoadedLatency = median(sink);
        }
        await sleep(DEFAULTS.loadedLatencyIntervalMs);
      }
    };
    void run();
    return () => {
      stopped = true;
    };
  }

  private hasXhr(): boolean {
    return typeof (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest === 'function';
  }

  private async measureTransfer(
    direction: 'download' | 'upload',
    durationMs: number,
    onUpdate: (p: { phaseProgress: number; bps: number; bytes: number }) => void,
  ): Promise<TransferOutcome> {
    const meter = new Meter(this.now);
    const concurrency = Math.max(1, this.options.concurrency ?? DEFAULTS.concurrency);
    const nowAtStart = this.now();
    const deadline = nowAtStart + durationMs;
    const warmupFraction = this.options.warmupFraction ?? DEFAULTS.warmupFraction;
    const sizer = new ChunkSizer({
      min: this.options.minChunkBytes,
      max: this.options.maxChunkBytes,
      targetMs: this.options.targetRequestMs,
      enabled: this.options.adaptiveChunks !== false,
    });
    let requests = 0;

    const loaded: number[] = [];
    const stopProbe =
      this.options.measureLoadedLatency === false ? () => undefined : this.startLoadedLatencyProbe(loaded, deadline);

    const workers = Array.from({ length: concurrency }, () =>
      direction === 'download'
        ? this.downloadWorker(meter, deadline, sizer, () => (requests += 1))
        : this.uploadWorker(meter, deadline, sizer, () => (requests += 1)),
    );

    const ticker = setInterval(() => {
      this.lastTotalBytes = meter.total();
      onUpdate({
        phaseProgress: Math.min(1, (this.now() - nowAtStart) / durationMs),
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
      stopProbe();
      meter.flush();
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
    // A failed stream after some data arrived is worth reporting, but only if it
    // killed most of the parallelism — one flaky request must not fail the test.
    if (workerError && requests <= concurrency) {
      throw workerError instanceof Error ? workerError : new Error(String(workerError));
    }

    return {
      bps: meter.steady(warmupFraction),
      p90: meter.steadyPercentile(warmupFraction, 90),
      median: meter.steadyMedian(warmupFraction),
      bytes: meter.total(),
      series: meter.series(),
      loadedLatencyMs: loaded.length ? median(loaded) : 0,
      loadedLatencySeries: [...loaded],
      requests,
    };
  }

  private async downloadWorker(
    meter: Meter,
    deadline: number,
    sizer: ChunkSizer,
    onRequest: () => void,
  ): Promise<void> {
    while (this.now() < deadline && !this.aborted) {
      const bytes = sizer.next();
      const url = `${this.withParam(this.paths.download, 'bytes', String(bytes))}&r=${Math.random().toString(36).slice(2)}`;
      const t0 = this.now();
      const res = await this.doFetch(url, { cache: 'no-store', signal: this.signal });
      if (!res.ok || !res.body) throw new Error(`Download endpoint returned HTTP ${res.status}`);
      onRequest();
      const reader = res.body.getReader();
      let received = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const n = value?.byteLength ?? 0;
          received += n;
          meter.add(n);
          if (this.now() >= deadline) break;
        }
      } finally {
        reader.cancel().catch(() => undefined);
      }
      sizer.observe(received, this.now() - t0);
    }
  }

  /**
   * A single incompressible buffer, reused by every request. Filling pseudo-random
   * bytes once (instead of keeping one buffer per chunk size) keeps the renderer's
   * memory flat even at 32 MiB chunks.
   */
  private payloadBuffer: Uint8Array | null = null;

  private payload(size: number): Uint8Array {
    const want = Math.max(1, Math.floor(size));
    if (!this.payloadBuffer || this.payloadBuffer.byteLength < want) {
      const buf = new Uint8Array(want);
      // Leave zeros between the markers: still incompressible to any real codec, far
      // cheaper to build than 32 MiB of crypto-random bytes.
      for (let i = 0; i < want; i += 4096) buf[i] = (i & 0xff) || 0x5a;
      buf[want - 1] = 0x5a;
      this.payloadBuffer = buf;
    }
    return want === this.payloadBuffer.byteLength ? this.payloadBuffer : this.payloadBuffer.subarray(0, want);
  }

  private async uploadWorker(
    meter: Meter,
    deadline: number,
    sizer: ChunkSizer,
    onRequest: () => void,
  ): Promise<void> {
    while (this.now() < deadline && !this.aborted) {
      const size = sizer.next();
      const body = this.payload(size);
      const url = this.withParam(this.paths.upload, 'r', Math.random().toString(36).slice(2));
      const t0 = this.now();
      onRequest();
      if (this.hasXhr()) {
        const sent = await this.xhrUpload(url, body, (delta) => meter.add(delta));
        sizer.observe(sent, this.now() - t0);
      } else {
        const res = await this.doFetch(url, {
          method: 'POST',
          body,
          headers: { 'content-type': 'application/octet-stream' },
          cache: 'no-store',
          signal: this.signal,
          // Half-duplex is required by Node's fetch when the body is a stream; a
          // Uint8Array works without it, but the flag is harmless and future-proof.
          duplex: 'half',
        } as RequestInit);
        if (!res.ok) throw new Error(`Upload endpoint returned HTTP ${res.status}`);
        await res.arrayBuffer();
        meter.add(size);
        sizer.observe(size, this.now() - t0);
      }
    }
  }

  /**
   * Uploads one body through XMLHttpRequest so progress can be metered *as it is
   * sent*. `fetch` has no upload-progress event, which is why a fetch-only upload
   * test cannot show a live number and only learns the size of a request when it has
   * already finished.
   */
  private xhrUpload(
    url: string,
    body: Uint8Array,
    onDelta: (bytes: number) => void,
  ): Promise<number> {
    type XhrLike = {
      open(method: string, url: string, async: boolean): void;
      setRequestHeader(name: string, value: string): void;
      send(payload: unknown): void;
      abort(): void;
      status: number;
      upload: { onprogress: ((event: { loaded: number; lengthComputable: boolean }) => void) | null };
      onload: (() => void) | null;
      onerror: (() => void) | null;
      onabort: (() => void) | null;
      ontimeout: (() => void) | null;
    };
    const Ctor = (globalThis as unknown as { XMLHttpRequest: new () => XhrLike }).XMLHttpRequest;

    return new Promise<number>((resolve, reject) => {
      const xhr = new Ctor();
      let reported = 0;
      let settled = false;
      const signal = this.signal;
      const onAbortSignal = () => xhr.abort();

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbortSignal);
        fn();
      };

      xhr.open('POST', url, true);
      xhr.setRequestHeader('content-type', 'application/octet-stream');
      xhr.upload.onprogress = (event) => {
        const loaded = Math.max(0, Math.min(event.loaded, body.byteLength));
        const delta = loaded - reported;
        if (delta > 0) {
          reported = loaded;
          onDelta(delta);
        }
      };
      xhr.onload = () =>
        finish(() => {
          // Whatever the progress events missed (headers, last flush) is still bytes
          // that left this machine.
          if (reported < body.byteLength) onDelta(body.byteLength - reported);
          if (xhr.status >= 200 && xhr.status < 300) resolve(body.byteLength);
          else reject(new Error(`Upload endpoint returned HTTP ${xhr.status}`));
        });
      xhr.onerror = () => finish(() => reject(new Error('Upload failed — the connection dropped')));
      xhr.onabort = () => finish(() => reject(new SpeedTestAborted()));
      xhr.ontimeout = () => finish(() => reject(new Error('Upload timed out')));
      if (signal.aborted) {
        xhr.abort();
      } else {
        signal.addEventListener('abort', onAbortSignal, { once: true });
      }
      try {
        xhr.send(body);
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Convenience wrapper: `runSpeedTest({...}).then(result => ...)` */
export function runSpeedTest(options?: SpeedTestOptions): SpeedTestHandle {
  const tester = new SpeedTester(options);
  // Bound, so callers can destructure `const { promise, abort } = runSpeedTest(...)`.
  return { promise: tester.promise, abort: () => tester.abort() };
}
