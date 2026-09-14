import { formatSpeed } from '@netgauge/core';
import Sparkline from '../components/Sparkline';
import { bridge } from '../lib/bridge';
import { useStore } from '../lib/store';

export default function Widget() {
  const { settings, sample, history, setPaused } = useStore();
  const unit = settings.monitor.unit;
  const down = formatSpeed(sample.smoothDownBps, unit);
  const up = formatSpeed(sample.smoothUpBps, unit);
  const peak = settings.widget.showPeak ? history.reduce((max, s) => Math.max(max, s.smoothDownBps), 0) : 0;
  const paused = settings.monitor.paused;

  return (
    <div className="ng-surface h-full" style={{ borderRadius: 'var(--ng-radius)' }}>
      <div className="ng-glow" />
      <div className="drag relative flex h-full flex-col justify-between p-4">
        <div className="flex items-center justify-between">
          <span className="ng-chip no-drag">
            <span
              className="ng-live-dot h-1.5 w-1.5 rounded-full"
              style={{ background: paused ? 'var(--ng-faint)' : 'var(--ng-accent)' }}
            />
            {paused ? 'Paused' : 'Live'}
          </span>
          <div className="no-drag flex items-center gap-1">
            <button
              type="button"
              className="ng-btn !px-2 !py-0.5 !text-[0.65rem]"
              aria-label={paused ? 'Resume monitoring' : 'Pause monitoring'}
              onClick={() => void setPaused(!paused)}
            >
              {paused ? '▶' : '❚❚'}
            </button>
            <button
              type="button"
              className="ng-btn !px-2 !py-0.5 !text-[0.65rem]"
              aria-label="Run speed test"
              onClick={() => void bridge.openView('test')}
            >
              Test
            </button>
            <button
              type="button"
              className="ng-btn !px-2 !py-0.5 !text-[0.65rem]"
              aria-label="Open Studio"
              onClick={() => void bridge.openView('studio')}
            >
              ⚙
            </button>
          </div>
        </div>

        <div className="mt-2">
          <p className="flex items-baseline gap-1.5">
            <span className="display text-[2rem] leading-none" style={{ color: 'var(--ng-accent)' }}>
              {down.value < 10 ? down.value.toFixed(2) : down.value.toFixed(1)}
            </span>
            <span className="text-[0.65rem]" style={{ color: 'var(--ng-muted)' }}>{down.unit} ↓</span>
          </p>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className="display text-[1.1rem] leading-none" style={{ color: '#a78bfa' }}>
              {up.value < 10 ? up.value.toFixed(2) : up.value.toFixed(1)}
            </span>
            <span className="text-[0.6rem]" style={{ color: 'var(--ng-muted)' }}>{up.unit} ↑</span>
          </p>
        </div>

        {settings.widget.showSparkline && (
          <Sparkline history={history} height={46} referenceBps={settings.monitor.referenceMbps * 1e6} />
        )}

        <div className="mt-2 flex items-center justify-between text-[0.6rem]" style={{ color: 'var(--ng-faint)' }}>
          <span className="truncate">{settings.widget.showAdapter ? (sample.interfaces[0] ?? settings.monitor.adapter) : ''}</span>
          {settings.widget.showPeak && peak > 0 && <span className="num">peak {formatSpeed(peak, unit).text}</span>}
        </div>
      </div>
    </div>
  );
}
