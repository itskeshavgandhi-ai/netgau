import { useEffect, useState } from 'react';
import { formatSpeed } from '@netgauge/core';
import LivePanel from '../components/LivePanel';
import SpeedTestPanel from '../components/SpeedTestPanel';
import AppearancePanel from '../components/AppearancePanel';
import { AboutPanel, BehaviourPanel, MonitorPanel, WidgetPanel } from '../components/SettingsPanels';
import { bridge, isSimulated } from '../lib/bridge';
import { useStore } from '../lib/store';

const TABS = [
  { id: 'live', label: 'Live', icon: 'M3 17V9m5 8V5m5 12v-6m5 6V8' },
  { id: 'test', label: 'Speed test', icon: 'M12 3a9 9 0 1 0 9 9M12 12l5-4' },
  { id: 'appearance', label: 'Appearance', icon: 'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1' },
  { id: 'widget', label: 'Widget', icon: 'M4 5h16v10H4zM9 19h6' },
  { id: 'monitor', label: 'Monitor', icon: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  { id: 'behaviour', label: 'Behaviour', icon: 'M6 4h9l3 3v13H6zM9 12h6M9 16h4' },
  { id: 'about', label: 'About', icon: 'M12 11v5m0-8.5v.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function Studio({ initialTab = 'live' }: { initialTab?: 'live' | 'test' }) {
  const { settings, sample } = useStore();
  const [tab, setTab] = useState<TabId>(initialTab);

  useEffect(() => setTab(initialTab), [initialTab]);

  // Tray menu → "Run speed test" lands here.
  useEffect(() => bridge.onOpenView((view) => setTab(view === 'test' ? 'test' : 'live')), []);
  const down = formatSpeed(sample.smoothDownBps, settings.monitor.unit);
  const up = formatSpeed(sample.smoothUpBps, settings.monitor.unit);

  return (
    <div className="ng-surface flex h-full flex-col" style={{ borderRadius: 'var(--ng-radius)' }}>
      {/* title bar */}
      <header className="drag flex h-12 shrink-0 items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
            <path d="M6 21.5a10.5 10.5 0 0 1 20 0" fill="none" stroke="var(--ng-accent)" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M16 21.5 22.5 11.5" stroke="var(--ng-accent)" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="16" cy="21.5" r="2.2" fill="currentColor" />
          </svg>
          <span className="display text-sm font-semibold">NetGauge</span>
          {isSimulated && <span className="ng-chip">Browser preview</span>}
        </div>

        <div className="no-drag flex items-center gap-3">
          <span className="num hidden text-[0.7rem] sm:inline" style={{ color: 'var(--ng-muted)' }}>
            ↓ {down.text} · ↑ {up.text}
          </span>
          <button
            type="button"
            className="ng-btn !px-2.5 !py-1"
            aria-label="Minimize"
            onClick={() => void bridge.window('minimize')}
          >
            –
          </button>
          <button type="button" className="ng-btn !px-2.5 !py-1" aria-label="Close" onClick={() => void bridge.window('close')}>
            ✕
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* sidebar */}
        <nav className="flex w-[186px] shrink-0 flex-col gap-1 border-r p-3" style={{ borderColor: 'rgb(var(--ng-hairline) / 0.08)' }}>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="no-drag flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[0.8rem] font-medium transition"
              style={{
                background: tab === item.id ? 'color-mix(in oklab, var(--ng-accent) 14%, transparent)' : 'transparent',
                color: tab === item.id ? 'var(--ng-accent)' : 'var(--ng-muted)',
              }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </button>
          ))}

          <div className="mt-auto ng-panel p-3">
            <p className="text-[0.6rem] tracking-[0.14em] uppercase" style={{ color: 'var(--ng-faint)' }}>Tray</p>
            <p className="num mt-1 text-[0.85rem]">{down.text}</p>
            <p className="num text-[0.7rem]" style={{ color: '#a78bfa' }}>{up.text}</p>
          </div>
        </nav>

        {/* content */}
        <main className="ng-scroll min-w-0 flex-1 p-5">
          {tab === 'live' && <LivePanel />}
          {tab === 'test' && <SpeedTestPanel />}
          {tab === 'appearance' && <AppearancePanel />}
          {tab === 'widget' && <WidgetPanel />}
          {tab === 'monitor' && <MonitorPanel />}
          {tab === 'behaviour' && <BehaviourPanel />}
          {tab === 'about' && <AboutPanel />}
        </main>
      </div>
    </div>
  );
}
