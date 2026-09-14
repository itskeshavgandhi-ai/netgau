import { useEffect, useRef } from 'react';
import { formatLatency, formatSpeed } from '@netgauge/core';
import { widgetLayoutOf, type NetGaugeSettings } from '../../shared/bridge';
import Sparkline from '../components/Sparkline';
import { bridge } from '../lib/bridge';
import { useStore } from '../lib/store';

/** Maps the window material setting onto the widget's CSS material. */
function widgetMaterial(settings: NetGaugeSettings): 'transparent' | 'glass' | 'solid' {
  const glass = settings.appearance.glass;
  if (glass === 'solid') return 'solid';
  if (glass === 'transparent') return 'transparent';
  return 'glass';
}

/** Exactly one decimal below 100, two below 10 — and thousands separators above 1000. */
function readout(bps: number, unitScale: number): string {
  const value = bps / unitScale;
  if (value >= 1000) return value.toFixed(0);
  if (value >= 100) return value.toFixed(1);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function unitScaleOf(settings: NetGaugeSettings): number {
  return settings.monitor.unit === 'bits' ? 1e6 : 1e6 / 8;
}

export default function Widget() {
  const { settings, sample, history, setPaused, lastResult } = useStore();
  const material = widgetMaterial(settings);
  const layout = widgetLayoutOf(settings);
  const unit = settings.monitor.unit;
  const scale = unitScaleOf(settings);
  const down = formatSpeed(sample.smoothDownBps, unit);
  const up = formatSpeed(sample.smoothUpBps, unit);
  const peak = history.reduce((max, s) => Math.max(max, s.smoothDownBps), 0);
  const paused = settings.monitor.paused;
  const rootRef = useRef<HTMLDivElement>(null);

  // Docked layout: the taskbar strip changes size with the settings, so the renderer
  // reports its natural content size back and the main process resizes the window.
  // (In a browser preview there is no window to resize; the call is a no-op there.)
  useEffect(() => {
    const node = rootRef.current;
    if (!node || layout !== 'card') return;
    const report = () => bridge.reportWidgetSize(node.scrollWidth, node.scrollHeight);
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [layout, settings.widget.showSparkline, settings.widget.showPeak, settings.widget.showAdapter, settings.widget.scale]);

  if (layout === 'taskbar') {
    return (
      <div ref={rootRef} className="ng-widget" data-material={material} style={{ borderRadius: 'var(--ng-radius)' }}>
        <div className="ng-taskbar-strip drag">
          <span
            className={paused ? 'h-2 w-2 shrink-0 rounded-full' : 'ng-live-dot h-2 w-2 shrink-0 rounded-full'}
            style={{ background: paused ? 'var(--ng-faint)' : 'var(--ng-accent)' }}
            title={paused ? 'Monitoring paused' : 'Monitoring live'}
          />

          <span className="ng-taskbar-metric ng-widget-readout" title={`Download ${down.text}`}>
            <span style={{ color: 'var(--ng-accent)', fontSize: '0.8rem' }}>↓</span>
            <span className="num ng-taskbar-value" style={{ fontSize: '0.95rem' }}>
              {readout(sample.smoothDownBps, scale)}
            </span>
            <span style={{ color: 'var(--ng-muted)', fontSize: '0.62rem' }}>{down.unit}</span>
          </span>

          <span className="ng-divider" />

          <span className="ng-taskbar-metric ng-widget-readout" title={`Upload ${up.text}`}>
            <span style={{ color: '#a78bfa', fontSize: '0.8rem' }}>↑</span>
            <span className="num ng-taskbar-value" style={{ fontSize: '0.95rem' }}>
              {readout(sample.smoothUpBps, scale)}
            </span>
            <span style={{ color: 'var(--ng-muted)', fontSize: '0.62rem' }}>{up.unit}</span>
          </span>

          {lastResult && (
            <>
              <span className="ng-divider" />
              <span className="ng-taskbar-metric ng-widget-readout" title="Ping from the last speed test">
                <span style={{ color: 'var(--ng-faint)', fontSize: '0.62rem' }}>ping</span>
                <span className="num ng-taskbar-value" style={{ fontSize: '0.72rem' }}>
                  {formatLatency(lastResult.latencyMs)}
                </span>
              </span>
            </>
          )}

          {settings.widget.showPeak && peak > 0 && (
            <span
              className="ng-taskbar-value ng-widget-readout ml-auto"
              style={{ color: 'var(--ng-faint)', fontSize: '0.6rem' }}
              title="Peak download this session"
            >
              peak {readout(peak, scale)} {down.unit}
            </span>
          )}

          {settings.widget.showSparkline && (
            <div className="no-drag shrink-0" style={{ width: 54, height: '58%' }}>
              <Sparkline history={history} height={24} referenceBps={settings.monitor.referenceMbps * 1e6} width={54} />
            </div>
          )}

          <button
            type="button"
            className="no-drag shrink-0"
            aria-label={paused ? 'Resume monitoring' : 'Pause monitoring'}
            title={paused ? 'Resume monitoring' : 'Pause monitoring'}
            onClick={() => void setPaused(!paused)}
            style={{
              color: 'var(--ng-muted)',
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              fontSize: '0.72rem',
              lineHeight: 1,
            }}
          >
            {paused ? '▶' : '❚❚'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="ng-widget" data-material={material} style={{ borderRadius: 'var(--ng-radius)' }}>
      <div className="drag relative flex h-full flex-col justify-between p-[14px]">
        <div className="flex items-center justify-between" style={{ height: 22 }}>
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
              aria-label="Open Studio"
              onClick={() => void bridge.openView('studio')}
            >
              ⚙
            </button>
          </div>
        </div>

        <div className="ng-widget-readout" style={{ marginTop: 8 }}>
          <p className="flex items-baseline gap-1.5" style={{ height: 34 }}>
            <span className="display text-[2rem] leading-none" style={{ color: 'var(--ng-accent)' }}>
              {readout(sample.smoothDownBps, scale)}
            </span>
            <span className="text-[0.65rem]" style={{ color: 'var(--ng-muted)' }}>
              {down.unit} ↓
            </span>
          </p>
          <p className="mt-0.5 flex items-baseline gap-1.5" style={{ height: 22 }}>
            <span className="display text-[1.1rem] leading-none" style={{ color: '#a78bfa' }}>
              {readout(sample.smoothUpBps, scale)}
            </span>
            <span className="text-[0.6rem]" style={{ color: 'var(--ng-muted)' }}>
              {up.unit} ↑
            </span>
          </p>
        </div>

        {settings.widget.showSparkline && (
          <div style={{ height: 46, marginTop: 8 }}>
            <Sparkline history={history} height={46} referenceBps={settings.monitor.referenceMbps * 1e6} />
          </div>
        )}

        {(settings.widget.showAdapter || settings.widget.showPeak) && (
          <div
            className="ng-widget-readout flex items-center justify-between text-[0.6rem]"
            style={{ color: 'var(--ng-faint)', height: 15, marginTop: 6 }}
          >
            <span className="truncate">
              {settings.widget.showAdapter ? (sample.interfaces[0] ?? (settings.monitor.adapter === 'auto' ? '' : settings.monitor.adapter)) : ''}
            </span>
            {settings.widget.showPeak && peak > 0 && <span className="num">peak {formatSpeed(peak, unit).text}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
