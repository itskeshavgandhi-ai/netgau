import { useEffect, useState } from 'react';
import { formatBytes } from '@netgauge/core';
import { bridge } from '../lib/bridge';
import { DEFAULT_SETTINGS } from '../../shared/bridge';
import { useStore } from '../lib/store';
import { Row, SectionCard, Select, Slider, TextInput, Toggle } from './controls';
import type { AdapterInfo, UnitMode } from '../../shared/bridge';

export { default as WidgetPanel } from './WidgetPanel';

export function MonitorPanel() {
  const { settings, update, setPaused } = useStore();
  const m = settings.monitor;
  const patch = (partial: Partial<typeof m>) => void update({ monitor: { ...m, ...partial } });
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);

  // Used to depend on `sample?.t`, which re-read every adapter counter once a second
  // and spawned a fresh PowerShell query each time.
  useEffect(() => {
    let cancelled = false;
    void bridge.getAdapters().then((list) => !cancelled && setAdapters(list));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <SectionCard title="Sampling" description="How often NetGauge reads the interface counters, and how the numbers are smoothed.">
        <Row label="Interval" hint="Lower is more responsive; 1000 ms is a good balance.">
          <Slider label="Sampling interval" value={m.sampleMs} min={250} max={5000} step={250} onChange={(sampleMs) => patch({ sampleMs })} format={(v) => `${v} ms`} />
        </Row>
        <Row label="Smoothing" hint="How quickly the displayed value reacts to change.">
          <Slider label="Smoothing" value={m.smoothing} min={0.05} max={1} step={0.05} onChange={(smoothing) => patch({ smoothing })} format={(v) => `${Math.round(v * 100)}%`} />
        </Row>
        <Row label="Units">
          <Select<UnitMode>
            label="Units"
            value={m.unit}
            onChange={(unit) => patch({ unit })}
            options={[
              { value: 'bits', label: 'Megabits (Mbps)' },
              { value: 'bytes', label: 'Megabytes (MB/s)' },
            ]}
          />
        </Row>
        <Row label="Adapter" hint="Auto monitors every physical adapter.">
          <select
            className="ng-select no-drag w-44"
            value={m.adapter}
            aria-label="Adapter"
            onChange={(event) => patch({ adapter: event.target.value })}
          >
            <option value="auto" style={{ color: '#0b1120' }}>Auto (all physical)</option>
            {adapters.map((adapter) => (
              <option key={adapter.name} value={adapter.name} style={{ color: '#0b1120' }}>
                {adapter.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Include virtual adapters" hint="Loopback, Docker bridges, VPN taps.">
          <Toggle label="Include virtual adapters" checked={m.includeVirtual} onChange={(includeVirtual) => patch({ includeVirtual })} />
        </Row>
        <Row label="Reference speed" hint="Used to scale the tray icon and the gauge.">
          <Slider label="Reference speed" value={m.referenceMbps} min={10} max={2000} step={10} onChange={(referenceMbps) => patch({ referenceMbps })} format={(v) => `${v} Mbps`} />
        </Row>
        <Row label="Monitoring">
          <button type="button" className="ng-btn no-drag" onClick={() => void setPaused(!m.paused)}>
            {m.paused ? 'Resume' : 'Pause'}
          </button>
        </Row>
      </SectionCard>
    </div>
  );
}

export function BehaviourPanel() {
  const { settings, update, simulated } = useStore();
  const b = settings.behaviour;
  const patch = (partial: Partial<typeof b>) => {
    void update({ behaviour: { ...b, ...partial } });
    if (partial.launchAtLogin !== undefined && !simulated) void bridge.setLoginItem(partial.launchAtLogin);
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Startup & tray" description="NetGauge is designed to live in the tray — closing the window never quits it.">
        <Row label="Launch at login" hint="Per-user login item, no admin rights needed.">
          <Toggle label="Launch at login" checked={b.launchAtLogin} onChange={(launchAtLogin) => patch({ launchAtLogin })} />
        </Row>
        <Row label="Start hidden" hint="Skip the window when Windows starts.">
          <Toggle label="Start hidden" checked={b.startHidden} onChange={(startHidden) => patch({ startHidden })} />
        </Row>
        <Row label="Minimize to tray" hint="Close button hides the window instead of quitting.">
          <Toggle label="Minimize to tray" checked={b.minimizeToTray} onChange={(minimizeToTray) => patch({ minimizeToTray })} />
        </Row>
        <Row label="Notify when slow" hint="A tray balloon after 15 s below the threshold.">
          <Toggle label="Notify when slow" checked={b.notifyOnDrop} onChange={(notifyOnDrop) => patch({ notifyOnDrop })} />
        </Row>
        <Row label="Slow threshold">
          <Slider label="Slow threshold" value={b.warnBelowMbps} min={1} max={200} onChange={(warnBelowMbps) => patch({ warnBelowMbps })} format={(v) => `${v} Mbps`} />
        </Row>
      </SectionCard>

      <SectionCard title="Speed test defaults">
        <Row label="Parallel streams" hint="More streams saturate fast links; 6 suits most home connections.">
          <Slider
            label="Parallel streams"
            value={settings.speedTest.concurrency}
            min={1}
            max={16}
            onChange={(concurrency) => void update({ speedTest: { ...settings.speedTest, concurrency } })}
          />
        </Row>
        <Row label="Phase duration">
          <Slider
            label="Phase duration"
            value={settings.speedTest.phaseDurationMs / 1000}
            min={2}
            max={30}
            onChange={(seconds) => void update({ speedTest: { ...settings.speedTest, phaseDurationMs: seconds * 1000 } })}
            format={(v) => `${v}s`}
          />
        </Row>
        <Row label="Loaded latency" hint="Probe latency while the line is saturated, to grade bufferbloat.">
          <Toggle
            label="Loaded latency"
            checked={settings.speedTest.measureLoadedLatency}
            onChange={(measureLoadedLatency) => void update({ speedTest: { measureLoadedLatency } })}
          />
        </Row>
        <Row label="Adaptive request sizes" hint="Keeps every request near one second so the live number is accurate.">
          <Toggle
            label="Adaptive request sizes"
            checked={settings.speedTest.adaptiveChunks}
            onChange={(adaptiveChunks) => void update({ speedTest: { adaptiveChunks } })}
          />
        </Row>
        <Row label="Server URL" hint="Used when the server choice is “Custom URL”, or alongside “NetGauge server”.">
          <TextInput
            value={settings.speedTest.serverUrl}
            onChange={(serverUrl) => void update({ speedTest: { serverUrl } })}
            label="Server URL"
            placeholder="https://your-netgauge-host"
            className="w-56"
          />
        </Row>
      </SectionCard>
    </div>
  );
}

export function AboutPanel() {
  const { settings, info, simulated, sample, update } = useStore();

  return (
    <div className="space-y-4">
      <SectionCard title="NetGauge" description="A glassy network monitor for the Windows tray, with a Speedtest-class test built in.">
        <Row label="Version">
          <span className="num text-xs" style={{ color: 'var(--ng-muted)' }}>{info?.version ?? '—'}</span>
        </Row>
        <Row label="Runtime">
          <span className="num text-xs" style={{ color: 'var(--ng-muted)' }}>
            {simulated ? 'browser preview' : `Electron ${info?.electron} · Chrome ${info?.chrome} · Node ${info?.node}`}
          </span>
        </Row>
        <Row label="Platform">
          <span className="num text-xs" style={{ color: 'var(--ng-muted)' }}>{info?.platform ?? '—'}</span>
        </Row>
        <Row label="Samples collected">
          <span className="num text-xs" style={{ color: 'var(--ng-muted)' }}>
            {sample.t ? new Date(sample.t).toLocaleTimeString() : '—'} · {formatBytes(sample.rxBytes + sample.txBytes)} this session
          </span>
        </Row>
        {info?.settingsError && (
          <Row label="Settings file" hint="The file on disk could not be read, so defaults were loaded.">
            <span className="text-[0.68rem]" style={{ color: '#fb7185' }}>{info.settingsError}</span>
          </Row>
        )}
        <Row label="Settings" hint="Stored as JSON in your user profile.">
          <button
            type="button"
            className="ng-btn no-drag"
            onClick={() => void update(DEFAULT_SETTINGS)}
          >
            Reset to defaults
          </button>
        </Row>
      </SectionCard>

      <SectionCard title="Source" description="NetGauge is MIT licensed.">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--ng-muted)' }}>
          github.com/thekeshavgandhi-dev/netgauge-demo — the tray app, the web speed test and the shared measurement
          engine all live in one repository.
        </p>
      </SectionCard>

      <SectionCard title="Current settings" description="Handy when reporting a bug.">
        <pre className="ng-scroll num max-h-56 overflow-auto rounded-lg p-3 text-[0.62rem] leading-relaxed" style={{ background: 'rgb(0 0 0 / 0.3)' }}>
          {JSON.stringify(settings, null, 2)}
        </pre>
      </SectionCard>
    </div>
  );
}
