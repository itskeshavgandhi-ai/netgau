import { formatBytes, formatLatency, formatRawBitrate, formatSpeed } from '@netgauge/core';
import { useStore } from '../lib/store';
import Sparkline from './Sparkline';
import { Stat } from './controls';

export default function LivePanel() {
  const { settings, sample, history, setPaused, lastResult } = useStore();
  const unit = settings.monitor.unit;
  const down = formatSpeed(sample.smoothDownBps, unit);
  const up = formatSpeed(sample.smoothUpBps, unit);
  const peak = history.reduce((max, s) => Math.max(max, s.smoothDownBps), 0);
  const paused = settings.monitor.paused;

  return (
    <div className="space-y-4">
      <div className="ng-panel relative overflow-hidden p-6">
        <div className="ng-glow" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="ng-chip">
              <span
                className="ng-live-dot h-1.5 w-1.5 rounded-full"
                style={{ background: paused ? 'var(--ng-faint)' : 'var(--ng-accent)' }}
              />
              {paused ? 'Paused' : 'Live'}
            </p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="display text-[3.4rem] leading-none" style={{ color: 'var(--ng-accent)' }}>
                {down.value < 10 ? down.value.toFixed(2) : down.value.toFixed(1)}
              </span>
              <span className="text-sm" style={{ color: 'var(--ng-muted)' }}>{down.unit}</span>
              <span className="text-lg" style={{ color: 'var(--ng-faint)' }}>↓</span>
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="display text-[1.6rem] leading-none" style={{ color: '#a78bfa' }}>
                {up.value < 10 ? up.value.toFixed(2) : up.value.toFixed(1)}
              </span>
              <span className="text-xs" style={{ color: 'var(--ng-muted)' }}>{up.unit} ↑</span>
            </p>
          </div>

          <button type="button" className="ng-btn no-drag" onClick={() => void setPaused(!paused)}>
            {paused ? 'Resume monitoring' : 'Pause monitoring'}
          </button>
        </div>

        <div className="relative mt-5">
          <Sparkline history={history} height={92} referenceBps={settings.monitor.referenceMbps * 1e6} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Peak down" value={formatSpeed(peak, unit).value.toFixed(1)} unit={formatSpeed(peak, unit).unit} color="var(--ng-accent)" />
        <Stat label="Session down" value={formatBytes(sample.rxBytes)} />
        <Stat label="Session up" value={formatBytes(sample.txBytes)} />
        <Stat
          label="Adapter"
          value={settings.monitor.adapter === 'auto' ? (sample.interfaces[0] ?? 'all') : settings.monitor.adapter}
        />
      </div>

      <div className="ng-panel p-4">
        <p className="text-[0.6rem] font-semibold tracking-[0.16em] uppercase" style={{ color: 'var(--ng-faint)' }}>
          Exact values
        </p>
        <div className="num mt-2 grid gap-x-8 gap-y-1 text-[0.72rem] sm:grid-cols-2">
          <span className="flex justify-between gap-3">
            <span style={{ color: 'var(--ng-faint)' }}>Download</span>
            <span>{formatRawBitrate(sample.downBps)}</span>
          </span>
          <span className="flex justify-between gap-3">
            <span style={{ color: 'var(--ng-faint)' }}>Upload</span>
            <span>{formatRawBitrate(sample.upBps)}</span>
          </span>
          <span className="flex justify-between gap-3">
            <span style={{ color: 'var(--ng-faint)' }}>Download (smoothed)</span>
            <span>{formatRawBitrate(sample.smoothDownBps)}</span>
          </span>
          <span className="flex justify-between gap-3">
            <span style={{ color: 'var(--ng-faint)' }}>Upload (smoothed)</span>
            <span>{formatRawBitrate(sample.smoothUpBps)}</span>
          </span>
          <span className="flex justify-between gap-3">
            <span style={{ color: 'var(--ng-faint)' }}>Combined</span>
            <span>{formatRawBitrate(sample.totalBps)}</span>
          </span>
          <span className="flex justify-between gap-3">
            <span style={{ color: 'var(--ng-faint)' }}>Last sample</span>
            <span>{sample.t ? new Date(sample.t).toLocaleTimeString() : '—'}</span>
          </span>
        </div>
        <p className="mt-3 text-[0.68rem]" style={{ color: 'var(--ng-muted)' }}>
          {lastResult
            ? `Last speed test: ${formatSpeed(lastResult.downBps, unit).text} down · ${formatSpeed(lastResult.upBps, unit).text} up · ${formatLatency(lastResult.latencyMs)} ping · grade ${lastResult.bufferbloatGrade}`
            : 'No speed test yet — run one from the Speed test tab for a full-line measurement.'}
        </p>
      </div>
    </div>
  );
}
