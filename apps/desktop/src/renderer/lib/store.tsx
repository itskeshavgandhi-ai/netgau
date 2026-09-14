import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RingBuffer, type SpeedTestResult } from '@netgauge/core';
import { DEFAULT_SETTINGS, type AppInfo, type LiveSample, type NetGaugeSettings } from '../../shared/bridge';
import { applySettings, watchSystemTheme } from './theme';
import { bridge, isSimulated } from './bridge';

const HISTORY_LENGTH = 180;

interface Store {
  settings: NetGaugeSettings;
  sample: LiveSample;
  history: LiveSample[];
  info: AppInfo | null;
  simulated: boolean;
  update: (patch: Partial<NetGaugeSettings>) => Promise<void>;
  setPaused: (paused: boolean) => Promise<void>;
  lastResult: SpeedTestResult | null;
  setLastResult: (result: SpeedTestResult | null) => void;
}

const StoreContext = createContext<Store | null>(null);

const emptySample: LiveSample = {
  t: 0,
  downBps: 0,
  upBps: 0,
  totalBps: 0,
  smoothDownBps: 0,
  smoothUpBps: 0,
  rxBytes: 0,
  txBytes: 0,
  interfaces: [],
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<NetGaugeSettings>(DEFAULT_SETTINGS);
  const [sample, setSample] = useState<LiveSample | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [lastResult, setLastResult] = useState<SpeedTestResult | null>(null);
  const buffer = useRef(new RingBuffer<LiveSample>(HISTORY_LENGTH));
  const [, forceRender] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void bridge.getSettings().then((s) => {
      if (cancelled) return;
      setSettings(s);
      applySettings(s);
    });
    void bridge.getAppInfo().then((i) => !cancelled && setInfo(i));

    const offSettings = bridge.onSettings((s) => {
      setSettings(s);
      applySettings(s);
    });
    const offSample = bridge.onSample((s) => {
      buffer.current.push(s);
      setSample(s);
      forceRender((n) => n + 1);
    });
    return () => {
      cancelled = true;
      offSettings();
      offSample();
    };
  }, []);

  useEffect(() => applySettings(settings), [settings]);
  useEffect(() => watchSystemTheme(settings, () => applySettings(settings)), [settings]);

  const update = useCallback(async (patch: Partial<NetGaugeSettings>) => {
    const next = await bridge.setSettings(patch);
    setSettings(next);
    applySettings(next);
    // Glass material can only be chosen when the window is created.
    if (patch.appearance?.glass && patch.appearance.glass !== settings.appearance.glass && !isSimulated) {
      void bridge.relaunchWindow();
    }
  }, [settings.appearance.glass]);

  const setPaused = useCallback(async (paused: boolean) => {
    await bridge.setPaused(paused);
  }, []);

  const value = useMemo<Store>(
    () => ({
      settings,
      sample: sample ?? emptySample,
      history: buffer.current.toArray(),
      info,
      simulated: isSimulated,
      update,
      setPaused,
      lastResult,
      setLastResult,
    }),
    [settings, sample, info, update, setPaused, lastResult],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}
