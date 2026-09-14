import { useCallback, useEffect, useRef, useState } from 'react';
import { formatLatency, formatSpeed, runSpeedTest, type SpeedProgress, type SpeedTestHandle, type SpeedTestResult } from '@netgauge/core';
import { DEFAULT_SPEED_SERVER } from '../../shared/bridge';
import { useStore } from '../lib/store';
import Sparkline from './Sparkline';
import { SectionCard, Stat, TextInput } from './controls';

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

export default function SpeedTestPanel() {
  const { settings, update, simulated, setLastResult, lastResult } = useStore();
  const [progress, setProgress] = useState<SpeedProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<Array<{ t: number; downBps: number; upBps: number; totalBps: number; smoothDownBps: number; smoothUpBps: number; rxBytes: number; txBytes: number; interfaces: string[] }>>([]);
  const handleRef = useRef<SpeedTestHandle | null>(null);
  const [url, setUrl] = useState(settings.speedTest.serverUrl);

  useEffect(() => setUrl(settings.speedTest.serverUrl), [settings.speedTest.serverUrl]);
  useEffect(() => () => handleRef.current?.abort(), []);

  const running = progress?.phase === 'latency' || progress?.phase === 'download' || progress?.phase === 'upload';
  const valueBps = progress?.phase === 'upload' ? progress.upBps : (progress?.downBps ?? 0);

  const start = useCallback(async () => {
    handleRef.current?.abort();
    setError(null);
    setSeries([]);
    const seriesState: typeof series = [];
    const baseUrl = settings.speedTest.serverUrl || (simulated ? '' : DEFAULT_SPEED_SERVER);

    const handle = runSpeedTest({
      baseUrl,
      concurrency: settings.speedTest.concurrency,
      phaseDurationMs: settings.speedTest.phaseDurationMs,
      onProgress: (p) => {
        setProgress(p);
        if (p.phase === 'download' || p.phase === 'upload') {
          seriesState.push({
            t: Date.now(),
            downBps: p.downBps,
            upBps: p.upBps,
            totalBps: p.downBps + p.upBps,
            smoothDownBps: p.downBps,
            smoothUpBps: p.upBps,
            rxBytes: 0,
            txBytes: 0,
            interfaces: [],
          });
          setSeries([...seriesState.slice(-120)]);
        }
      },
    });
    handleRef.current = handle;

    try {
      const result = await handle.promise;
      setLastResult(result);
    } catch (err) {
      if (err instanceof Error && err.name !== 'SpeedTestAborted') {
        setError(err.message);
      }
      setProgress(null);
    } finally {
      handleRef.current = null;
    }
  }, [settings.speedTest.concurrency, settings.speedTest.phaseDurationMs, settings.speedTest.serverUrl, setLastResult, simulated]);

  const result: SpeedTestResult | null = progress?.phase === 'done' ? (lastResult ?? null) : lastResult;

  return (
    <div className="space-y-4">
      <div className="ng-panel relative overflow-hidden p-6">
        <div className="ng-glow" />
        <div className="relative flex flex-wrap items-center justify-between gap-8">
          <RadialGauge valueBps={result && !running ? result.downBps : valueBps} progress={progress?.progress ?? 0} />

          <div className="min-w-[220px] flex-1">
            <p className="ng-chip">
              {running ? progress?.phase : result ? 'Complete' : 'Ready'}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Download" value={result ? formatSpeed(result.downBps).value.toFixed(2) : '—'} unit={result ? formatSpeed(result.downBps).unit : ''} color="var(--ng-accent)" />
              <Stat label="Upload" value={result ? formatSpeed(result.upBps).value.toFixed(2) : '—'} unit={result ? formatSpeed(result.upBps).unit : ''} color="#a78bfa" />
              <Stat label="Ping" value={result ? formatLatency(result.latencyMs) : '—'} />
              <Stat label="Jitter" value={result ? formatLatency(result.jitterMs) : '—'} />
            </div>

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
              {error && <span className="text-[0.7rem]" style={{ color: '#fb7185' }}>{error}</span>}
            </div>
          </div>
        </div>

        {series.length > 1 && (
          <div className="relative mt-6">
            <Sparkline history={series} height={70} showUp />
          </div>
        )}
      </div>

      <SectionCard
        title="Test server"
        description="Point NetGauge at any server running the NetGauge speed API — leave it blank to use the public one."
      >
        <div className="flex flex-wrap items-center gap-3">
          <TextInput
            value={url}
            onChange={setUrl}
            label="Speed test server URL"
            placeholder={DEFAULT_SPEED_SERVER}
            className="w-72"
          />
          <button
            type="button"
            className="ng-btn"
            onClick={() => void update({ speedTest: { ...settings.speedTest, serverUrl: url.trim() } })}
          >
            Save
          </button>
        </div>
        <p className="text-[0.68rem]" style={{ color: 'var(--ng-faint)' }}>
          {settings.speedTest.concurrency} parallel streams · {(settings.speedTest.phaseDurationMs / 1000).toFixed(0)} s per phase
          {simulated ? ' · running in browser preview (proxied to localhost:3000)' : ''}
        </p>
      </SectionCard>
    </div>
  );
}
