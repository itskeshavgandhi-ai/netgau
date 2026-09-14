import { ema } from '@netgauge/core';
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type AdapterInfo,
  type AppInfo,
  type LiveSample,
  type NetGaugeApi,
  type NetGaugeSettings,
  type ViewName,
  type WindowAction,
} from '../../shared/bridge';

declare global {
  interface Window {
    netgauge?: NetGaugeApi;
  }
}

const STORAGE_KEY = 'netgauge.preview.settings.v1';

/**
 * Browser fallback: when the renderer is opened outside Electron (for example
 * `npm run dev:renderer`, or the preview build), it simulates the tray feed so
 * the UI is fully usable — fonts, colours, glass and the speed test all work,
 * only the interface counters are synthetic.
 */
class SimulatedBridge implements NetGaugeApi {
  private settings: NetGaugeSettings;
  private readonly settingsListeners = new Set<(s: NetGaugeSettings) => void>();
  private readonly sampleListeners = new Set<(s: LiveSample) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private smoothDown = 0;
  private smoothUp = 0;
  private down = 0;
  private up = 0;
  private rxBytes = 0;
  private txBytes = 0;
  private burstUntil = 0;

  constructor() {
    this.settings = this.readStored();
    this.startTimer();
    // Seed a little history so the sparkline is not empty on first paint.
    for (let i = 0; i < 40; i += 1) this.step(true);
  }

  private readStored(): NetGaugeSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? mergeSettings(DEFAULT_SETTINGS, JSON.parse(raw)) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  private startTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.step(), this.settings.monitor.sampleMs);
  }

  private step(silent = false): void {
    const now = Date.now();
    if (Math.random() < 0.02) this.burstUntil = now + 3000 + Math.random() * 6000;
    const bursting = now < this.burstUntil;
    const target = bursting ? 380 + Math.random() * 140 : 90 + Math.random() * 90;
    this.down += (target - this.down) * 0.18;
    this.up += ((bursting ? 26 : 9) + Math.random() * 8 - this.up) * 0.2;

    const seconds = this.settings.monitor.sampleMs / 1000;
    this.rxBytes += (this.down * 1e6 * seconds) / 8;
    this.txBytes += (this.up * 1e6 * seconds) / 8;
    this.smoothDown = ema(this.smoothDown, this.down * 1e6, this.settings.monitor.smoothing);
    this.smoothUp = ema(this.smoothUp, this.up * 1e6, this.settings.monitor.smoothing);

    if (silent || this.settings.monitor.paused) return;
    const sample: LiveSample = {
      t: now,
      downBps: this.down * 1e6,
      upBps: this.up * 1e6,
      totalBps: (this.down + this.up) * 1e6,
      smoothDownBps: this.smoothDown,
      smoothUpBps: this.smoothUp,
      rxBytes: this.rxBytes,
      txBytes: this.txBytes,
      interfaces: ['Wi-Fi (simulated)'],
    };
    for (const listener of this.sampleListeners) listener(sample);
  }

  async getSettings(): Promise<NetGaugeSettings> {
    return this.settings;
  }

  async setSettings(patch: Partial<NetGaugeSettings>): Promise<NetGaugeSettings> {
    const next = mergeSettings(this.settings, patch);
    const intervalChanged = next.monitor.sampleMs !== this.settings.monitor.sampleMs;
    this.settings = next;
    this.persist();
    if (intervalChanged) this.startTimer();
    for (const listener of this.settingsListeners) listener(next);
    return next;
  }

  onSettings(handler: (settings: NetGaugeSettings) => void): () => void {
    this.settingsListeners.add(handler);
    return () => this.settingsListeners.delete(handler);
  }

  onSample(handler: (sample: LiveSample) => void): () => void {
    this.sampleListeners.add(handler);
    return () => this.sampleListeners.delete(handler);
  }

  async getAdapters(): Promise<AdapterInfo[]> {
    return [
      { name: 'Wi-Fi (simulated)', rxBytes: this.rxBytes, txBytes: this.txBytes },
      { name: 'Ethernet (simulated)', rxBytes: 0, txBytes: 0 },
    ];
  }

  async setPaused(paused: boolean): Promise<void> {
    await this.setSettings({ monitor: { ...this.settings.monitor, paused } });
  }

  async window(_action: WindowAction, _value?: boolean): Promise<void> {
    // Nothing to do in a browser tab.
  }

  async openView(view: ViewName): Promise<void> {
    window.location.hash = `#/${view}`;
  }

  onOpenView(handler: (view: ViewName) => void): () => void {
    const listener = () => {
      const match = /#\/(studio|widget|test)/.exec(window.location.hash);
      if (match) handler(match[1] as ViewName);
    };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }

  async getAppInfo(): Promise<AppInfo> {
    return {
      version: '0.1.0-preview',
      platform: 'browser',
      electron: '—',
      chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? '—',
      node: '—',
      isPackaged: false,
      simulated: true,
    };
  }

  async setLoginItem(): Promise<void> {
    /* no-op */
  }

  async relaunchWindow(): Promise<void> {
    /* no-op */
  }
}

export const bridge: NetGaugeApi = typeof window !== 'undefined' && window.netgauge ? window.netgauge : new SimulatedBridge();
export const isSimulated = !(typeof window !== 'undefined' && window.netgauge);
