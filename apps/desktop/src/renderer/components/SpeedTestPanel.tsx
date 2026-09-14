import { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatBytes,
  formatLatency,
  formatPercent,
  formatRawBitrate,
  formatSpeed,
  formatSpeedExact,
  runSpeedTest,
  type ServerMeta,
  type SpeedProgress,
  type SpeedTestHandle,
  type SpeedTestResult,
} from '@netgauge/core';
import {
  SPEED_SERVER_PRESETS,
  mapCloudflareMeta,
  resolveSpeedServer,
  type SpeedServerMode,
} from '../../shared/bridge';
import { useStore } from '../lib/store';
import Sparkline from './Sparkline';
import { SectionCard, Stat, TextInput } from './controls';

const PHASE_LABEL: Record<string, string> = {
  idle: 'Ready',
  latency: 'Measuring ping',
  download: 'Download',
  upload: 'Upload',
  done: 'Complete',
  error: 'Failed',
};

function RadialGauge({ valueBps, progress }: { valueBps: number; progress: number }) {
  const size = 168;
  const stroke = 12;
  const radius = size / 2 - stroke;
  const circumference = 2 * Math.PI * radius;
  const mbps = valueBps / 1e6;
  const fraction = Math.min(1, Math.max(0, mbps <= 0 ? 0 : (Math.log10(Math.min(mbps, 1000)) + 2) / 5));

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ng-gauge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ng-accent)" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgb(var(--ng-hairline) / 0.1)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ng-gauge)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius + stroke / 2 + 6}
          fill="none"
          stroke="rgb(var(--ng-hairline) / 0.08)"
          strokeWidth={2}
          strokeDasharray={2 * Math.PI * (radius + stroke / 2 + 6)}
          strokeDashoffset={2 * Math.PI * (radius + stroke / 2 + 6) * (1 - progress)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="display text-[2.4rem] leading-none">
          {mbps === 0 ? '—' : mbps < 10 ? mbps.toFixed(2) : mbps.toFixed(1)}
        </span>
        <span className="text-[0.65rem] tracking-[0.2em] uppercase" style={{ color: 'var(--ng-muted)' }}>
          Mbps
        </span>
      </div>
    </div>
  );
}

function Detail({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1" title={hint}>
      <span className="text-[0.68rem]" style={{ color: 'var(--ng-faint)' }}>
        {label}
      </span>
      <span className="num text-right text-[0.7rem]">{value}</span>
    </div>
  );
}

export default function SpeedTestPanel() {
  const { settings, update, simulated, setLastResult, lastResult } = useStore();
  const [progress, setProgress] = useState<SpeedProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<Array<{ t: number; value: number }>>([]);
  const [server, setServer] = useState<ServerMeta | null>(null);
  const handleRef = useRef<SpeedTestHandle | null>(null);
  const [url, setUrl] = useState(settings.speedTest.serverUrl);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => setUrl(settings.speedTest.serverUrl), [settings.speedTest.serverUrl]);
  useEffect(() => () => handleRef.current?.abort(), []);
  useEffect(() => setServer(lastResult?.server ?? null), [lastResult]);

  const running =
    progress?.phase === 'latency' || progress?.phase === 'download' || progress?.phase === 'upload' || progress?.phase === 'idle';
  const valueBps = progress?.phase === 'upload' ? (progress?.upBps ?? 0) : (progress?.downBps ?? 0);

  const start = useCallback(async () => {
    handleRef.current?.abort();
    setError(null);
    setSeries([]);
    const base = resolveSpeedServer(settings, {
      netgaugeBaseUrl: simulated ? '' : undefined,
    });

    const handle = runSpeedTest({
      baseUrl: base.baseUrl,
      paths: base.paths,
      concurrency: settings.speedTest.concurrency,
      phaseDurationMs: settings.speedTest.phaseDurationMs,
      measureLoadedLatency: settings.speedTest.measureLoadedLatency,
      adaptiveChunks: settings.speedTest.adaptiveChunks,
      mapMeta: base.kind === 'cloudflare' ? mapCloudflareMeta : undefined,
      onProgress: (p) => {
        setProgress(p);
        if (p.phase === 'download' || p.phase === 'upload') {
          const value = p.phase === 'upload' ? p.upBps : p.downBps;
          setSeries((previous) => [...previous.slice(-179), { t: Date.now(), value }]);
        }
      },
    });
    handleRef.current = handle;

    try {
      const result = await handle.promise;
      setLastResult(result);
      setServer(result.server);
    } catch (err) {
      if (!(err instanceof Error && err.name === 'SpeedTestAborted')) {
        const message = err instanceof Error ? err.message : String(err);
        setError(
          /failed to fetch|networkerror|load failed/i.test(message)
            ? `Could not reach ${base.label} (${base.baseUrl || 'this page'}). Check your connection, or pick another server below.`
            : message,
        );
      }
      setProgress(null);
    } finally {
      handleRef.current = null;
    }
  }, [settings, simulated, setLastResult]);

  const result: SpeedTestResult | null = lastResult;
  const phasesDone = !running && result;

  return (
    <div className="space-y-4">
      <div className="ng-panel relative overflow-hidden p-6">
        <div className="ng-glow" />
        <div className="relative flex flex-wrap items-center justify-between gap-8">
          <RadialGauge valueBps={phasesDone ? result.downBps : valueBps} progress={progress?.progress ?? 0} />

          <div className="min-w-[240px] flex-1">
            <p className="ng-chip">{running ? (PHASE_LABEL[progress?.phase ?? 'idle'] ?? 'Working') : result ? 'Complete' : 'Ready'}</p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat
                label="Download"
                value={result && !running ? formatSpeedExact(result.downBps).replace(/ [^ ]+$/, '') : running && progress?.downBps ? formatSpeed(progress.downBps).value.toFixed(2) : '—'}
                unit={result && !running ? formatSpeed(result.downBps).unit : ''}
                color="var(--ng-accent)"
              />
              <Stat
                label="Upload"
                value={result && !running ? formatSpeedExact(result.upBps).replace(/ [^ ]+$/, '') : running && progress?.upBps ? formatSpeed(progress.upBps).value.toFixed(2) : '—'}
                unit={result && !running ? formatSpeed(result.upBps).unit : ''}
                color="#a78bfa"
              />
              <Stat label="Ping" value={result ? formatLatency(result.latencyMs) : '—'} />
              <Stat label="Jitter" value={result ? formatLatency(result.jitterMs) : '—'} />
            </div>

            {progress?.loadedLatencyMs && running && (
              <p className="mt-3 text-[0.68rem]" style={{ color: 'var(--ng-faint)' }}>
                Latency under load right now: <span className="num">{formatLatency(progress.loadedLatencyMs)}</span>
              </p>
            )}

            <div className="mt-5 flex items-center gap-3">
              {running ? (
                <button type="button" className="ng-btn" onClick={() => handleRef.current?.abort()}>
                  Cancel
                </button>
              ) : (
                <button type="button" className="ng-btn ng-btn-accent" onClick={() => void start()}>
                  {result ? 'Run again' : 'Run speed test'}
                </button>
              )}
              {handleRef.current === null && result && (
                <button type="button" className="ng-btn" onClick={() => setShowDetails((v) => !v)}>
                  {showDetails ? 'Hide exact numbers' : 'Show exact numbers'}
                </button>
              )}
              {error && (
                <span className="text-[0.7rem]" style={{ color: '#fb7185' }}>
                  {error}
                </span>
              )}
            </div>
          </div>
        </div>

        {series.length > 1 && (
          <div className="relative mt-6">
            <Sparkline
              history={series.map((point) => ({
                t: point.t,
                downBps: point.value,
                upBps: point.value,
                totalBps: point.value,
                smoothDownBps: point.value,
                smoothUpBps: point.value,
                rxBytes: 0,
                txBytes: 0,
                interfaces: [],
              }))}
              height={70}
              showUp={false}
            />
          </div>
        )}
      </div>

      {result && showDetails && (
        <SectionCard
          title="Exact numbers"
          description="Everything the engine measured, unrounded. The headline figure is total bytes ÷ elapsed time over the steady window; the percentile is what Cloudflare's test publishes."
        >
          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            <Detail label="Download (steady state)" value={formatRawBitrate(result.downBps)} />
            <Detail label="Upload (steady state)" value={formatRawBitrate(result.upBps)} />
            <Detail label="Download, 90th percentile" value={formatRawBitrate(result.downBpsP90)} />
            <Detail label="Upload, 90th percentile" value={formatRawBitrate(result.upBpsP90)} />
            <Detail label="Download, median sample" value={formatRawBitrate(result.downBpsMedian)} />
            <Detail label="Upload, median sample" value={formatRawBitrate(result.upBpsMedian)} />
            <Detail label="Ping (best of N)" value={`${result.latencyMs.toFixed(2)} ms`} />
            <Detail label="Ping (median)" value={`${result.medianLatencyMs.toFixed(2)} ms`} />
            <Detail label="Ping (mean)" value={`${result.meanLatencyMs.toFixed(2)} ms`} />
            <Detail label="Jitter" value={`${result.jitterMs.toFixed(2)} ms`} />
            <Detail label="Packet loss" value={formatPercent(result.lossPercent)} />
            <Detail label="Latency under download" value={`${result.loadedDownLatencyMs.toFixed(2)} ms`} />
            <Detail label="Latency under upload" value={`${result.loadedUpLatencyMs.toFixed(2)} ms`} />
            <Detail
              label="Bufferbloat"
              value={`${result.bufferbloatMs.toFixed(1)} ms added · grade ${result.bufferbloatGrade}`}
              hint="Added latency under load. A+ ≤5 ms, A ≤30, B ≤60, C ≤200, D ≤400, F worse."
            />
            <Detail label="Data transferred" value={`${formatBytes(result.bytesDown)} down · ${formatBytes(result.bytesUp)} up`} />
            <Detail label="Duration" value={`${(result.durationMs / 1000).toFixed(1)} s`} />
            <Detail label="Streams" value={String(result.method.concurrency)} />
            <Detail label="Phase length" value={`${(result.method.phaseDurationMs / 1000).toFixed(0)} s each direction`} />
            <Detail label="Slow-start discarded" value={`${Math.round(result.method.warmupFraction * 100)}%`} />
            <Detail label="Request sizing" value={result.method.adaptiveChunks ? `adaptive ${formatBytes(result.method.minChunkBytes, 0)} – ${formatBytes(result.method.maxChunkBytes, 0)}` : 'fixed ramp'} />
            <Detail label="Upload metering" value={result.method.uploadMetering === 'xhr-progress' ? 'streamed (XHR progress)' : 'per request'} />
            <Detail label="Latency probes" value={`${result.method.pingCount} idle · ${result.method.loadedLatency ? 'probes under load' : 'none under load'}`} />
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Test server"
        description="Where the test sends its traffic. The numbers describe the path to this server, not the whole internet."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[0.68rem]" style={{ color: 'var(--ng-faint)' }}>
            Server
            <select
              className="ng-select no-drag mt-1 w-64"
              value={settings.speedTest.server}
              aria-label="Speed test server"
              onChange={(event) => void update({ speedTest: { server: event.target.value as SpeedServerMode } })}
            >
              {SPEED_SERVER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id} style={{ color: '#0b1120' }}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          {settings.speedTest.server === 'custom' && (
            <>
              <TextInput
                value={url}
                onChange={setUrl}
                label="Speed test server URL"
                placeholder="https://my-server.example"
                className="w-72"
              />
              <button
                type="button"
                className="ng-btn"
                onClick={() => void update({ speedTest: { serverUrl: url.trim() } })}
              >
                Save
              </button>
            </>
          )}
        </div>

        <p className="text-[0.68rem]" style={{ color: 'var(--ng-faint)' }}>
          {SPEED_SERVER_PRESETS.find((p) => p.id === settings.speedTest.server)?.note} ·{' '}
          {settings.speedTest.concurrency} parallel streams · {(settings.speedTest.phaseDurationMs / 1000).toFixed(0)} s per phase
          {simulated ? ' · browser preview uses this machine’s /api/speed/*' : ''}
        </p>

        <div className="mt-2 rounded-lg p-3 text-[0.68rem] leading-relaxed" style={{ background: 'rgb(0 0 0 / 0.25)', color: 'var(--ng-muted)' }}>
          <p className="font-semibold" style={{ color: 'var(--ng-ink)' }}>
            {server?.name ?? (result ? 'Speed server' : 'Not tested yet')}
          </p>
          <p>
            {[server?.location, server?.country].filter(Boolean).join(', ') || 'Location unknown'} · {server?.isp ?? 'ISP unknown'} ·{' '}
            {server?.host ?? server?.baseUrl ?? '—'}
          </p>
          {server?.ip && server.ip !== 'hidden' && <p className="num">{server.ip}</p>}
        </div>
      </SectionCard>
    </div>
  );
}
