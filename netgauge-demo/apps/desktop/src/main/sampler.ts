import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  diffCounters,
  ema,
  parseNetstatIb,
  parseNetstatSummary,
  parseProcNetDev,
  type IfaceCounters,
} from '@netgauge/core';
import type { LiveSample, PlatformName } from '../shared/bridge';

export interface CounterReader {
  /** Human-readable strategy name, shown in Studio → Monitor. */
  readonly kind: string;
  read(): Promise<IfaceCounters[]>;
  dispose?(): void;
}

export interface SamplerOptions {
  reader: CounterReader;
  intervalMs: number;
  adapter: string;
  includeVirtual: boolean;
  smoothing: number;
  onSample: (sample: LiveSample) => void;
  now?: () => number;
}

/* ------------------------------------------------------------------ *
 * Platform readers
 * ------------------------------------------------------------------ */

const BLOCK_MARKER = '###';

/** Splits a stream buffer into complete blocks, returning whatever is left over. */
export function splitBlocks(buffer: string): { blocks: string[]; rest: string } {
  const parts = buffer.split(BLOCK_MARKER);
  const rest = parts.pop() ?? '';
  return { blocks: parts.filter((p) => p.trim().length > 0), rest };
}

/** Parses `name<TAB>rx<TAB>tx` lines (the format our PowerShell script emits). */
export function parseCounterBlock(block: string): IfaceCounters[] {
  const out: IfaceCounters[] = [];
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name, rx, tx] = trimmed.split('\t');
    if (!name) continue;
    const rxBytes = Number(rx);
    const txBytes = Number(tx);
    if (!Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) continue;
    out.push({ name: name.trim(), rxBytes, txBytes });
  }
  return out;
}

const POWERSHELL_LOOP = (intervalMs: number) => `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
while ($true) {
  Get-NetAdapterStatistics | ForEach-Object { "{0}\`t{1}\`t{2}" -f $_.Name, $_.ReceivedBytes, $_.SentBytes }
  '${BLOCK_MARKER}'
  Start-Sleep -Milliseconds ${Math.max(100, Math.round(intervalMs))}
}`;

/**
 * Windows: one long-lived PowerShell process that prints adapter counters on a
 * timer. Spawning `powershell.exe` once per tick would cost ~200 ms of CPU each
 * second, which is exactly what a tray app must not do.
 */
export function createWindowsReader(intervalMs: number): CounterReader {
  let child: ReturnType<typeof spawn> | null = null;
  let buffer = '';
  let pending: ((counters: IfaceCounters[]) => void) | null = null;
  const queue: IfaceCounters[][] = [];
  let disposed = false;

  const start = () => {
    if (disposed) return;
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', POWERSHELL_LOOP(intervalMs)], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      const { blocks, rest } = splitBlocks(buffer);
      buffer = rest;
      for (const block of blocks) {
        const counters = parseCounterBlock(block);
        if (pending) {
          const resolve = pending;
          pending = null;
          resolve(counters);
        } else {
          queue.push(counters);
          if (queue.length > 4) queue.shift();
        }
      }
    });
    child.on('exit', () => {
      child = null;
      // Restart after a crash so monitoring survives a PowerShell hiccup.
      if (!disposed) setTimeout(start, 1000);
    });
    child.on('error', () => {
      child = null;
    });
  };

  start();

  return {
    kind: 'Windows · Get-NetAdapterStatistics',
    read() {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      if (!child) return Promise.resolve([]);
      return new Promise<IfaceCounters[]>((resolve) => {
        pending = resolve;
        // Never leave the sampler hanging if PowerShell stalls.
        setTimeout(() => {
          if (pending === resolve) {
            pending = null;
            resolve([]);
          }
        }, 5000);
      });
    },
    dispose() {
      disposed = true;
      child?.kill();
      child = null;
    },
  };
}

/** Windows fallback when PowerShell is unavailable: aggregate `netstat -e` counters. */
export function createNetstatReader(): CounterReader {
  return {
    kind: 'Windows · netstat -e',
    async read() {
      const { stdout } = await runCommand('netstat', ['-e']);
      const parsed = parseNetstatSummary(stdout);
      return parsed ? [{ name: 'All adapters', rxBytes: parsed.rxBytes, txBytes: parsed.txBytes }] : [];
    },
  };
}

/** Linux: read the kernel's own counter file — no subprocess at all. */
export function createProcReader(): CounterReader {
  return {
    kind: 'Linux · /proc/net/dev',
    async read() {
      const text = await readFile('/proc/net/dev', 'utf8');
      return parseProcNetDev(text);
    },
  };
}

/** macOS/BSD. */
export function createNetstatIbReader(): CounterReader {
  return {
    kind: 'macOS · netstat -ib',
    async read() {
      const { stdout } = await runCommand('netstat', ['-ib']);
      return parseNetstatIb(stdout);
    },
  };
}

function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => {
      stdout += d;
    });
    child.stderr?.on('data', (d: string) => {
      stderr += d;
    });
    child.on('error', reject);
    child.on('close', () => resolve({ stdout, stderr }));
  });
}

export function createReaderForPlatform(platform: PlatformName, intervalMs: number): CounterReader {
  if (platform === 'win32') return createWindowsReader(intervalMs);
  if (platform === 'darwin') return createNetstatIbReader();
  return createProcReader();
}

/* ------------------------------------------------------------------ *
 * Sampler
 * ------------------------------------------------------------------ */

export interface SamplerStats {
  samples: number;
  dropped: number;
  lastError?: string;
}

/**
 * Polls the reader on an interval, diffs the counters, smooths the result and
 * pushes a `LiveSample`. Re-entrancy is guarded so a slow reader (a busy
 * PowerShell) can never overlap itself.
 */
export class Sampler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private previous: IfaceCounters[] = [];
  private previousAt = 0;
  private hasPrevious = false;
  private smoothDown = 0;
  private smoothUp = 0;
  private busy = false;
  readonly stats: SamplerStats = { samples: 0, dropped: 0 };

  constructor(private options: SamplerOptions) {}

  private get now(): () => number {
    return this.options.now ?? Date.now;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
    void this.tick();
  }

  /** Stops polling but keeps the reader alive (used by "Pause monitoring"). */
  stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Stops polling and releases the underlying reader (used on quit). */
  stop(): void {
    this.stopTimer();
    this.options.reader.dispose?.();
  }

  /** One-off counter read, used by the adapter picker in Studio. */
  readCounters(): Promise<IfaceCounters[]> {
    return this.options.reader.read();
  }

  setOptions(options: Partial<Omit<SamplerOptions, 'reader'>>): void {
    this.options = { ...this.options, ...options };
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
    }
  }

  reset(): void {
    this.previous = [];
    this.previousAt = 0;
    this.hasPrevious = false;
    this.smoothDown = 0;
    this.smoothUp = 0;
  }

  async tick(): Promise<LiveSample | null> {
    if (this.busy) {
      this.stats.dropped += 1;
      return null;
    }
    this.busy = true;
    try {
      const at = this.now();
      const counters = await this.options.reader.read();
      if (counters.length === 0) {
        this.stats.lastError = 'no counters';
        return null;
      }
      // A flag rather than `previousAt > 0`: monotonic clocks can legitimately start at 0.
      const seconds = this.hasPrevious ? (at - this.previousAt) / 1000 : 0;
      const filter = {
        only: this.options.adapter && this.options.adapter !== 'auto' ? this.options.adapter : undefined,
        includeVirtual: this.options.includeVirtual,
      };

      let sample: LiveSample;
      if (this.hasPrevious && seconds > 0) {
        const diff = diffCounters(this.previous, counters, seconds, filter);
        this.smoothDown = ema(this.smoothDown, diff.downBps, this.options.smoothing);
        this.smoothUp = ema(this.smoothUp, diff.upBps, this.options.smoothing);
        sample = {
          t: at,
          downBps: diff.downBps,
          upBps: diff.upBps,
          totalBps: diff.totalBps,
          smoothDownBps: this.smoothDown,
          smoothUpBps: this.smoothUp,
          rxBytes: diff.rxBytes,
          txBytes: diff.txBytes,
          interfaces: diff.interfaces,
        };
        this.stats.samples += 1;
      } else {
        // First tick: no delta yet, so report zeroes rather than a bogus rate.
        sample = {
          t: at,
          downBps: 0,
          upBps: 0,
          totalBps: 0,
          smoothDownBps: 0,
          smoothUpBps: 0,
          rxBytes: 0,
          txBytes: 0,
          interfaces: [],
        };
      }

      this.previous = counters;
      this.previousAt = at;
      this.hasPrevious = true;
      this.options.onSample(sample);
      return sample;
    } catch (error) {
      this.stats.lastError = error instanceof Error ? error.message : String(error);
      return null;
    } finally {
      this.busy = false;
    }
  }
}
