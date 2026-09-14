'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatLatency, formatSpeed, runSpeedTest, type ServerMeta, type SpeedProgress, type SpeedTestHandle, type SpeedTestResult } from '@netgauge/core';
import Gauge, { type GaugePhase } from './Gauge';
import Sparkline from './Sparkline';
import { clearHistory, loadHistory, pushHistory, relativeTime, type TestRecord } from '@/lib/history';

type Phase = GaugePhase;

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Ready',
  latency: 'Ping',
  download: 'Download',
  upload: 'Upload',
  done: 'Complete',
  error: 'Failed',
};

function Arrow({ dir }: { dir: 'down' | 'up' }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
      <path
        d={dir === 'down' ? 'M8 2v9m0 0 4-4m-4 4-4-4' : 'M8 14V5m0 0 4 4m-4-4-4 4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SpeedTest() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [live, setLive] = useState({ down: 0, up: 0 });
  const [series, setSeries] = useState<number[]>([]);
  const [result, setResult] = useState<SpeedTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState<ServerMeta | null>(null);
  const [history, setHistory] = useState<TestRecord[]>([]);
  const [copied, setCopied] = useState(false);
  const handleRef = useRef<SpeedTestHandle | null>(null);
  const seriesRef = useRef<number[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
    let cancelled = false;
    fetch('/api/speed/meta', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((meta: ServerMeta | null) => {
        if (!cancelled && meta) setServer(meta);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      handleRef.current?.abort();
    };
  }, []);

  const onProgress = useCallback((p: SpeedProgress) => {
    setPhase(p.phase);
    setProgress(p.progress);
    setLive({ down: p.downBps, up: p.upBps });
    const active = p.phase === 'upload' ? p.upBps : p.downBps;
    if (p.phase === 'download' || p.phase === 'upload') {
      seriesRef.current = [...seriesRef.current.slice(-119), active];
      setSeries(seriesRef.current);
    }
  }, []);

  const start = useCallback(async () => {
    handleRef.current?.abort();
    seriesRef.current = [];
    setSeries([]);
    setResult(null);
    setError(null);
    setProgress(0);
    setLive({ down: 0, up: 0 });

    const handle = runSpeedTest({
      baseUrl: '',
      phaseDurationMs: 10_000,
      concurrency: 6,
      onProgress,
    });
    handleRef.current = handle;

    try {
      const res = await handle.promise;
      setResult(res);
      setSeries(res.downloadSeries.length > 2 ? res.downloadSeries : seriesRef.current);
      setHistory(
        pushHistory({
          id: `${res.startedAt}`,
          at: res.startedAt,
          downBps: res.downBps,
          upBps: res.upBps,
          latencyMs: res.latencyMs,
          jitterMs: res.jitterMs,
          isp: res.server.isp,
          location: res.server.location,
        }),
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'SpeedTestAborted') {
        setPhase('idle');
        setProgress(0);
        return;
      }
      setError(err instanceof Error ? err.message : 'The test could not be completed.');
      setPhase('error');
    } finally {
      handleRef.current = null;
    }
  }, [onProgress]);

  const cancel = useCallback(() => {
    handleRef.current?.abort();
  }, []);

  const running = phase === 'latency' || phase === 'download' || phase === 'upload';
  const valueBps = phase === 'upload' ? live.up : live.down;
  const displayValue = result && phase === 'done' ? result.downBps : valueBps;

  const headline = useMemo(() => {
    const f = formatSpeed(displayValue, 'bits');
    return { value: f.value < 10 ? f.value.toFixed(2) : f.value.toFixed(1), unit: f.unit };
  }, [displayValue]);

  const share = useCallback(async () => {
    if (!result) return;
    const text = [
      `NetGauge speed test`,
      `↓ ${formatSpeed(result.downBps).text}`,
      `↑ ${formatSpeed(result.upBps).text}`,
      `ping ${formatLatency(result.latencyMs)} · jitter ${formatLatency(result.jitterMs)}`,
      result.server.isp ? `ISP: ${result.server.isp}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }, [result]);

  return (
    <section id="test" className="relative mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <div className="glass overflow-hidden rounded-[28px] p-5 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          {/* ---------------- gauge ---------------- */}
          <div className="flex flex-col items-center">
            <Gauge valueBps={displayValue} progress={progress} phase={phase}>
              {phase === 'idle' && (
                <button
                  type="button"
                  onClick={start}
                  className="btn btn-primary pointer-events-auto relative h-[132px] w-[132px] flex-col gap-0 rounded-full text-base tracking-[0.16em] uppercase"
                  aria-label="Start speed test"
                >
                  <span className="pulse-ring absolute inset-0 rounded-full border border-white/40" aria-hidden />
                  Go
                </button>
              )}

              {(phase === 'download' || phase === 'upload') && (
                <div className="flex flex-col items-center">
                  <span className="chip mb-1">{PHASE_LABEL[phase]}</span>
                  <span className="stat-value text-5xl leading-none sm:text-6xl">{headline.value}</span>
                  <span className="mt-1.5 text-xs font-medium tracking-[0.18em] text-muted uppercase">{headline.unit}</span>
                </div>
              )}

              {phase === 'latency' && (
                <div className="flex flex-col items-center">
                  <span className="chip mb-1">Ping</span>
                  <span className="stat-value animate-pulse text-5xl leading-none">···</span>
                </div>
              )}

              {phase === 'done' && result && (
                <div className="flex flex-col items-center">
                  <span className="chip mb-1 border-lime/30 text-lime">Complete</span>
                  <span className="stat-value text-5xl leading-none sm:text-6xl">{headline.value}</span>
                  <span className="mt-1.5 text-xs font-medium tracking-[0.18em] text-muted uppercase">{headline.unit} down</span>
                </div>
              )}

              {phase === 'error' && (
                <div className="flex max-w-[190px] flex-col items-center gap-2">
                  <span className="chip border-rose/40 text-rose">Failed</span>
                  <p className="text-xs text-muted">{error ?? 'Something went wrong.'}</p>
                </div>
              )}
            </Gauge>

            <div className="mt-5 flex w-full items-center justify-center gap-3">
              {running ? (
                <button type="button" onClick={cancel} className="btn btn-ghost">
                  Cancel
                </button>
              ) : (
                <>
                  <button type="button" onClick={start} className="btn btn-primary">
                    {result ? 'Test again' : 'Start test'}
                  </button>
                  {result && (
                    <button type="button" onClick={share} className="btn btn-ghost">
                      {copied ? 'Copied' : 'Copy result'}
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="mt-4 h-11 w-full max-w-[320px]">
              {series.length > 1 && <Sparkline values={series} className="h-full w-full" />}
            </div>
          </div>

          {/* ---------------- readouts ---------------- */}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Download"
                value={result ? formatSpeed(result.downBps).value.toFixed(result.downBps < 1e7 ? 2 : 1) : live.down ? formatSpeed(live.down).value.toFixed(1) : '—'}
                unit={result ? formatSpeed(result.downBps).unit : live.down ? formatSpeed(live.down).unit : ''}
                icon="down"
                accent="text-cyan"
                active={phase === 'download'}
              />
              <StatCard
                label="Upload"
                value={result ? formatSpeed(result.upBps).value.toFixed(result.upBps < 1e7 ? 2 : 1) : live.up ? formatSpeed(live.up).value.toFixed(1) : '—'}
                unit={result ? formatSpeed(result.upBps).unit : live.up ? formatSpeed(live.up).unit : ''}
                icon="up"
                accent="text-violet"
                active={phase === 'upload'}
              />
              <StatCard
                label="Ping"
                value={result ? formatLatency(result.latencyMs) : '—'}
                unit=""
                accent="text-lime"
                active={phase === 'latency'}
              />
              <StatCard
                label="Jitter"
                value={result ? formatLatency(result.jitterMs) : '—'}
                unit=""
                accent="text-amber"
              />
            </div>

            <div className="glass-soft rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">Test server</p>
                  <p className="mt-1 truncate font-display text-sm text-mist">
                    {server?.name ?? 'NetGauge Edge'}
                    {server?.location ? ` · ${server.location}` : ''}
                  </p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">Your network</p>
                  <p className="mt-1 truncate font-display text-sm text-mist">
                    {server?.isp ?? (server?.ip && server.ip !== 'hidden' ? server.ip : 'Detecting…')}
                  </p>
                </div>
              </div>
              <p className="num mt-3 text-[11px] text-faint">
                  IP {server?.ip ?? '—'} · region {server?.country ?? '—'} · host {server?.host ?? '—'}
              </p>
            </div>

            <HistoryPanel history={history} onClear={() => { clearHistory(); setHistory([]); }} />
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-faint">
        Measurements run entirely between your browser and this server. Nothing is uploaded or stored.
      </p>
    </section>
  );
}

function StatCard({
  label,
  value,
  unit,
  icon,
  accent,
  active,
}: {
  label: string;
  value: string;
  unit: string;
  icon?: 'up' | 'down';
  accent: string;
  active?: boolean;
}) {
  return (
    <div
      className={`glass-soft relative overflow-hidden rounded-2xl p-4 transition-all duration-300 ${
        active ? 'border-white/25 bg-white/[0.07]' : ''
      }`}
    >
      {active && <span className="shimmer pointer-events-none absolute inset-0 opacity-30" aria-hidden />}
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">
        {icon && <span className={accent}><Arrow dir={icon} /></span>}
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`stat-value text-2xl ${accent}`}>{value}</span>
        {unit && <span className="text-xs font-medium text-muted">{unit}</span>}
      </div>
    </div>
  );
}

function HistoryPanel({ history, onClear }: { history: TestRecord[]; onClear: () => void }) {
  if (history.length === 0) {
    return (
      <div className="glass-soft flex flex-col items-start gap-1 rounded-2xl p-4">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">Recent tests</p>
        <p className="text-sm text-muted">Your last 12 results stay on this device — run a test to see them here.</p>
      </div>
    );
  }

  return (
    <div className="glass-soft rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">Recent tests</p>
        <button type="button" onClick={onClear} className="text-[11px] font-medium text-faint transition hover:text-rose">
          Clear
        </button>
      </div>
      <ul className="mt-3 divide-y divide-white/5">
        {history.slice(0, 5).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="num text-sm text-mist">{formatSpeed(r.downBps).text}</p>
              <p className="text-[11px] text-faint">
                ↑ {formatSpeed(r.upBps).text} · {formatLatency(r.latencyMs)} · {relativeTime(r.at)}
              </p>
            </div>
            <Sparkline
              values={[r.latencyMs, Math.max(r.downBps, r.upBps) / 1e6, r.downBps / 1e6]}
              width={70}
              height={26}
              className="h-6 w-16 shrink-0 opacity-70"
              gradientId={`spark-${r.id}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
