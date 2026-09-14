/**
 * The contract between the Electron main process, the preload bridge and the
 * renderer. Everything the user can customise lives in `NetGaugeSettings`, and
 * `sanitizeSettings` is the single place that validates/clamps it — so a corrupt
 * settings file can never put the app into an impossible state.
 */

export type GlassMode = 'acrylic' | 'mica' | 'transparent' | 'solid';
export type ThemeMode = 'dark' | 'light' | 'system';
export type UnitMode = 'bits' | 'bytes';

export interface FontChoice {
  id: string;
  label: string;
  /** CSS font-family value. */
  family: string;
  /** Suggested role in the UI. */
  kind: 'ui' | 'display' | 'mono';
  note?: string;
}

/** Every typeface the app bundles — no network fetch, works offline. */
export const FONT_CHOICES: FontChoice[] = [
  { id: 'inter', label: 'Inter', family: "'Inter Variable'", kind: 'ui', note: 'Neutral, highly legible' },
  { id: 'manrope', label: 'Manrope', family: "'Manrope Variable'", kind: 'ui', note: 'Semi-geometric, warm' },
  { id: 'space-grotesk', label: 'Space Grotesk', family: "'Space Grotesk Variable'", kind: 'display', note: 'Techy, great numerals' },
  { id: 'sora', label: 'Sora', family: "'Sora Variable'", kind: 'display', note: 'Wide, modern grotesque' },
  { id: 'outfit', label: 'Outfit', family: "'Outfit Variable'", kind: 'display', note: 'Clean geometric' },
  { id: 'bricolage', label: 'Bricolage Grotesque', family: "'Bricolage Grotesque Variable'", kind: 'display', note: 'Editorial, characterful' },
  { id: 'unbounded', label: 'Unbounded', family: "'Unbounded Variable'", kind: 'display', note: 'Loud display face' },
  { id: 'chakra-petch', label: 'Chakra Petch', family: "'Chakra Petch'", kind: 'display', note: 'HUD / instrument panel' },
  { id: 'rajdhani', label: 'Rajdhani', family: "'Rajdhani'", kind: 'display', note: 'Condensed, dense' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', family: "'JetBrains Mono Variable'", kind: 'mono', note: 'Tabular numerals' },
  { id: 'geist-mono', label: 'Geist Mono', family: "'Geist Mono Variable'", kind: 'mono', note: 'Tight, engineered' },
  { id: 'ibm-plex-mono', label: 'IBM Plex Mono', family: "'IBM Plex Mono'", kind: 'mono', note: 'Classic instrument look' },
];

export const ACCENTS = [
  { id: 'cyan', label: 'Cyan', hex: '#22d3ee' },
  { id: 'sky', label: 'Sky', hex: '#38bdf8' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6' },
  { id: 'lime', label: 'Lime', hex: '#a3e635' },
  { id: 'emerald', label: 'Emerald', hex: '#34d399' },
  { id: 'amber', label: 'Amber', hex: '#fbbf24' },
  { id: 'rose', label: 'Rose', hex: '#fb7185' },
  { id: 'ice', label: 'Ice', hex: '#e2e8f0' },
];

export interface AppearanceSettings {
  theme: ThemeMode;
  /** Window material. acrylic/mica need Windows 11; the rest work everywhere. */
  glass: GlassMode;
  /** Surface opacity, 0.15 (barely there) → 1 (opaque). */
  opacity: number;
  /** CSS backdrop blur in px. */
  blur: number;
  accent: string;
  cornerRadius: number;
  uiFont: string;
  displayFont: string;
  monoFont: string;
  /** Global type scale multiplier. */
  fontScale: number;
  fontWeight: number;
  letterSpacing: number;
  showGlow: boolean;
  showNoise: boolean;
}

export interface WidgetSettings {
  enabled: boolean;
  alwaysOnTop: boolean;
  /** Let clicks pass through the widget (it becomes an overlay). */
  clickThrough: boolean;
  width: number;
  scale: number;
  position: { x: number; y: number } | null;
  showSparkline: boolean;
  showPeak: boolean;
  showAdapter: boolean;
}

export interface MonitorSettings {
  /** Sampling interval in ms. */
  sampleMs: number;
  /** EMA alpha for the displayed value: 1 = raw, 0.05 = very smooth. */
  smoothing: number;
  unit: UnitMode;
  /** 'auto' = every physical adapter, or a specific adapter name. */
  adapter: string;
  includeVirtual: boolean;
  /** Reference line speed used to scale the tray icon and gauge. */
  referenceMbps: number;
  paused: boolean;
}

export interface SpeedTestSettings {
  /** Base URL of a NetGauge speed server. '' = the public one. */
  serverUrl: string;
  concurrency: number;
  phaseDurationMs: number;
}

export interface BehaviourSettings {
  launchAtLogin: boolean;
  startHidden: boolean;
  minimizeToTray: boolean;
  /** Tray balloon when throughput drops below `warnBelowMbps` for a while. */
  notifyOnDrop: boolean;
  warnBelowMbps: number;
}

export interface NetGaugeSettings {
  version: 1;
  appearance: AppearanceSettings;
  widget: WidgetSettings;
  monitor: MonitorSettings;
  speedTest: SpeedTestSettings;
  behaviour: BehaviourSettings;
}

export const DEFAULT_SETTINGS: NetGaugeSettings = {
  version: 1,
  appearance: {
    theme: 'dark',
    glass: 'acrylic',
    opacity: 0.62,
    blur: 26,
    accent: '#22d3ee',
    cornerRadius: 18,
    uiFont: "'Inter Variable'",
    displayFont: "'Space Grotesk Variable'",
    monoFont: "'JetBrains Mono Variable'",
    fontScale: 1,
    fontWeight: 400,
    letterSpacing: -0.01,
    showGlow: true,
    showNoise: true,
  },
  widget: {
    enabled: true,
    alwaysOnTop: true,
    clickThrough: false,
    width: 300,
    scale: 1,
    position: null,
    showSparkline: true,
    showPeak: true,
    showAdapter: true,
  },
  monitor: {
    sampleMs: 1000,
    smoothing: 0.35,
    unit: 'bits',
    adapter: 'auto',
    includeVirtual: false,
    referenceMbps: 300,
    paused: false,
  },
  speedTest: {
    serverUrl: '',
    concurrency: 6,
    phaseDurationMs: 10_000,
  },
  behaviour: {
    launchAtLogin: false,
    startHidden: false,
    minimizeToTray: true,
    notifyOnDrop: false,
    warnBelowMbps: 10,
  },
};

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

const GLASS_MODES: GlassMode[] = ['acrylic', 'mica', 'transparent', 'solid'];
const THEMES: ThemeMode[] = ['dark', 'light', 'system'];
const UNITS: UnitMode[] = ['bits', 'bytes'];

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function hex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const candidate = value.startsWith('#') ? value : `#${value}`;
  if (!HEX.test(candidate)) return fallback;
  // Expand #abc → #aabbcc so downstream colour math is uniform.
  if (candidate.length === 4) {
    return `#${candidate[1]}${candidate[1]}${candidate[2]}${candidate[2]}${candidate[3]}${candidate[3]}`.toLowerCase();
  }
  return candidate.toLowerCase();
}

function fontFamily(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const match = FONT_CHOICES.find((f) => f.family === value || f.id === value || f.label === value);
  return match ? match.family : fallback;
}

/** Deep-merge + clamp an untrusted settings object onto the defaults. */
export function sanitizeSettings(input: unknown): NetGaugeSettings {
  const d = DEFAULT_SETTINGS;
  const raw = (input ?? {}) as Partial<Record<keyof NetGaugeSettings, Record<string, unknown>>>;
  const a = (raw.appearance ?? {}) as Partial<AppearanceSettings> & Record<string, unknown>;
  const w = (raw.widget ?? {}) as Partial<WidgetSettings> & Record<string, unknown>;
  const m = (raw.monitor ?? {}) as Partial<MonitorSettings> & Record<string, unknown>;
  const s = (raw.speedTest ?? {}) as Partial<SpeedTestSettings> & Record<string, unknown>;
  const b = (raw.behaviour ?? {}) as Partial<BehaviourSettings> & Record<string, unknown>;

  const position =
    w.position && typeof w.position === 'object' && w.position !== null
      ? { x: num((w.position as { x?: unknown }).x, 0, -32_000, 32_000), y: num((w.position as { y?: unknown }).y, 0, -32_000, 32_000) }
      : null;

  return {
    version: 1,
    appearance: {
      theme: oneOf(a.theme, THEMES, d.appearance.theme),
      glass: oneOf(a.glass, GLASS_MODES, d.appearance.glass),
      opacity: num(a.opacity, d.appearance.opacity, 0.15, 1),
      blur: num(a.blur, d.appearance.blur, 0, 60),
      accent: hex(a.accent, d.appearance.accent),
      cornerRadius: num(a.cornerRadius, d.appearance.cornerRadius, 0, 32),
      uiFont: fontFamily(a.uiFont, d.appearance.uiFont),
      displayFont: fontFamily(a.displayFont, d.appearance.displayFont),
      monoFont: fontFamily(a.monoFont, d.appearance.monoFont),
      fontScale: num(a.fontScale, d.appearance.fontScale, 0.8, 1.4),
      fontWeight: num(a.fontWeight, d.appearance.fontWeight, 300, 700),
      letterSpacing: num(a.letterSpacing, d.appearance.letterSpacing, -0.05, 0.12),
      showGlow: bool(a.showGlow, d.appearance.showGlow),
      showNoise: bool(a.showNoise, d.appearance.showNoise),
    },
    widget: {
      enabled: bool(w.enabled, d.widget.enabled),
      alwaysOnTop: bool(w.alwaysOnTop, d.widget.alwaysOnTop),
      clickThrough: bool(w.clickThrough, d.widget.clickThrough),
      width: num(w.width, d.widget.width, 220, 560),
      scale: num(w.scale, d.widget.scale, 0.7, 1.8),
      position,
      showSparkline: bool(w.showSparkline, d.widget.showSparkline),
      showPeak: bool(w.showPeak, d.widget.showPeak),
      showAdapter: bool(w.showAdapter, d.widget.showAdapter),
    },
    monitor: {
      sampleMs: num(m.sampleMs, d.monitor.sampleMs, 250, 5000),
      smoothing: num(m.smoothing, d.monitor.smoothing, 0.05, 1),
      unit: oneOf(m.unit, UNITS, d.monitor.unit),
      adapter: str(m.adapter, d.monitor.adapter),
      includeVirtual: bool(m.includeVirtual, d.monitor.includeVirtual),
      referenceMbps: num(m.referenceMbps, d.monitor.referenceMbps, 10, 10_000),
      paused: bool(m.paused, d.monitor.paused),
    },
    speedTest: {
      serverUrl: typeof s.serverUrl === 'string' ? s.serverUrl.replace(/\/+$/, '') : d.speedTest.serverUrl,
      concurrency: Math.round(num(s.concurrency, d.speedTest.concurrency, 1, 16)),
      phaseDurationMs: Math.round(num(s.phaseDurationMs, d.speedTest.phaseDurationMs, 2000, 60_000)),
    },
    behaviour: {
      launchAtLogin: bool(b.launchAtLogin, d.behaviour.launchAtLogin),
      startHidden: bool(b.startHidden, d.behaviour.startHidden),
      minimizeToTray: bool(b.minimizeToTray, d.behaviour.minimizeToTray),
      notifyOnDrop: bool(b.notifyOnDrop, d.behaviour.notifyOnDrop),
      warnBelowMbps: num(b.warnBelowMbps, d.behaviour.warnBelowMbps, 1, 1000),
    },
  };
}

/** Shallow patch merge used by the settings IPC before sanitising. */
export function mergeSettings(base: NetGaugeSettings, patch: unknown): NetGaugeSettings {
  const p = (patch ?? {}) as Record<string, unknown>;
  return sanitizeSettings({
    ...base,
    appearance: { ...base.appearance, ...(p.appearance as object) },
    widget: { ...base.widget, ...(p.widget as object) },
    monitor: { ...base.monitor, ...(p.monitor as object) },
    speedTest: { ...base.speedTest, ...(p.speedTest as object) },
    behaviour: { ...base.behaviour, ...(p.behaviour as object) },
  });
}

/** `#22d3ee` → `[34, 211, 238]`, for the tray rasterizer. */
export function hexToRgb(hexValue: string): [number, number, number] {
  const clean = hexValue.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return [34, 211, 238];
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/* ------------------------------------------------------------------ *
 * Live data + IPC surface
 * ------------------------------------------------------------------ */

export interface LiveSample {
  t: number;
  downBps: number;
  upBps: number;
  totalBps: number;
  /** Smoothed values actually shown in the UI. */
  smoothDownBps: number;
  smoothUpBps: number;
  rxBytes: number;
  txBytes: number;
  interfaces: string[];
}

export interface AdapterInfo {
  name: string;
  rxBytes: number;
  txBytes: number;
}

export const CHANNELS = {
  settingsGet: 'ng:settings:get',
  settingsSet: 'ng:settings:set',
  settingsChanged: 'ng:settings:changed',
  sample: 'ng:sample',
  adapters: 'ng:adapters',
  setPaused: 'ng:paused',
  windowAction: 'ng:window',
  openView: 'ng:open-view',
  openViewRequest: 'ng:open-view-request',
  appInfo: 'ng:app-info',
  loginItem: 'ng:login-item',
  relaunchWindow: 'ng:relaunch-window',
} as const;

export type WindowAction = 'minimize' | 'close' | 'hide' | 'always-on-top';
export type ViewName = 'studio' | 'widget' | 'test';

/** Portable stand-in for NodeJS.Platform so the renderer needs no node types. */
export type PlatformName =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd'
  | 'browser';

export interface AppInfo {
  version: string;
  platform: PlatformName;
  electron: string;
  chrome: string;
  node: string;
  isPackaged: boolean;
  /** True when the renderer is running in a plain browser (no Electron bridge). */
  simulated: boolean;
}

/** What `window.netgauge` exposes to the renderer. */
export interface NetGaugeApi {
  getSettings(): Promise<NetGaugeSettings>;
  setSettings(patch: Partial<NetGaugeSettings>): Promise<NetGaugeSettings>;
  onSettings(handler: (settings: NetGaugeSettings) => void): () => void;
  onSample(handler: (sample: LiveSample) => void): () => void;
  getAdapters(): Promise<AdapterInfo[]>;
  setPaused(paused: boolean): Promise<void>;
  window(action: WindowAction, value?: boolean): Promise<void>;
  openView(view: ViewName): Promise<void>;
  /** Main process asks the renderer to switch view (tray menu → "Run speed test"). */
  onOpenView(handler: (view: ViewName) => void): () => void;
  getAppInfo(): Promise<AppInfo>;
  setLoginItem(enabled: boolean): Promise<void>;
  /** Rebuild the window — needed when the glass material changes. */
  relaunchWindow(): Promise<void>;
}

export const DEFAULT_SPEED_SERVER = 'https://netgauge.app';
