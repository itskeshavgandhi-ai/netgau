import type { ServerMeta } from '@netgauge/core';

/**
 * The contract between the Electron main process, the preload bridge and the
 * renderer. Everything the user can customise lives in `NetGaugeSettings`, and
 * `sanitizeSettings` is the single place that validates/clamps it — so a corrupt
 * settings file can never put the app into an impossible state.
 */

export type GlassMode = 'acrylic' | 'mica' | 'transparent' | 'solid';
export type ThemeMode = 'dark' | 'light' | 'system';
export type UnitMode = 'bits' | 'bytes';
/** `card` is the floating information card; `taskbar` is the one-line docked strip. */
export type WidgetLayout = 'auto' | 'card' | 'taskbar';
/** Where the widget lives: floating anywhere, or pinned into the Windows taskbar. */
export type WidgetDock = 'floating' | 'taskbar';
export type TaskbarEdge = 'auto' | 'bottom' | 'top' | 'left' | 'right';
/**
 * Horizontal anchor inside the taskbar. `before-start` is the interesting one: it
 * parks the widget immediately to the LEFT of the Start button (Windows 11's
 * centred taskbar), which is what most people want.
 */
export type DockAlign = 'before-start' | 'after-start' | 'start' | 'center' | 'tray';
/** Which speed server the desktop test talks to. */
export type SpeedServerMode = 'auto' | 'netgauge' | 'cloudflare' | 'custom';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  /** Card width in CSS px (before `scale`). */
  width: number;
  scale: number;
  /** Remembered free-floating position (only used when `dock` is `floating`). */
  position: { x: number; y: number } | null;
  showSparkline: boolean;
  showPeak: boolean;
  showAdapter: boolean;
  layout: WidgetLayout;
  dock: WidgetDock;
  dockEdge: TaskbarEdge;
  dockAlign: DockAlign;
  /** Manual nudge in px, added on top of whatever was auto-detected. */
  dockOffsetX: number;
  dockOffsetY: number;
  /** Gap between the widget and the Start button, in px. */
  dockGap: number;
  /** Height of the docked strip in px (the taskbar is ~48 px on Windows 11). */
  dockThickness: number;
  /**
   * What to do when the taskbar is set to auto-hide: `follow` tracks it off-screen
   * (so the widget disappears with it), `keep` leaves the widget on screen at the
   * last known spot.
   */
  dockAutoHide: 'follow' | 'keep';
  /** Cached Start-button rectangle from the last UI Automation probe. */
  startButton: Rect | null;
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
  /** Which server to measure against. */
  server: SpeedServerMode;
  /** Base URL used when `server` is `custom`. */
  serverUrl: string;
  concurrency: number;
  phaseDurationMs: number;
  /** Fire latency probes during the transfer phases to grade bufferbloat. */
  measureLoadedLatency: boolean;
  /** Grow/shrink each request so it lasts about a second. */
  adaptiveChunks: boolean;
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

/**
 * A patch is one level deep: `{ widget: { width: 320 } }` changes only the width.
 * The main process deep-merges it (`SettingsStore.patch`), so unrelated keys in the
 * same section survive — which a shallow spread would silently reset.
 */
export type SettingsPatch = {
  [K in keyof NetGaugeSettings]?: NetGaugeSettings[K] extends object ? Partial<NetGaugeSettings[K]> : NetGaugeSettings[K];
};

export const DEFAULT_SETTINGS: NetGaugeSettings = {
  version: 1,
  appearance: {
    theme: 'dark',
    // The widget is a see-through strip by default (that is what it is for); the
    // Studio window is always opaque regardless of this value.
    glass: 'transparent',
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
    layout: 'auto',
    dock: 'taskbar',
    dockEdge: 'auto',
    dockAlign: 'before-start',
    dockOffsetX: 0,
    dockOffsetY: 0,
    dockGap: 8,
    dockThickness: 34,
    dockAutoHide: 'follow',
    startButton: null,
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
    server: 'auto',
    serverUrl: '',
    concurrency: 6,
    phaseDurationMs: 10_000,
    measureLoadedLatency: true,
    adaptiveChunks: true,
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
const WIDGET_LAYOUTS: WidgetLayout[] = ['auto', 'card', 'taskbar'];
const WIDGET_DOCKS: WidgetDock[] = ['floating', 'taskbar'];
const TASKBAR_EDGES: TaskbarEdge[] = ['auto', 'bottom', 'top', 'left', 'right'];
const DOCK_ALIGNS: DockAlign[] = ['before-start', 'after-start', 'start', 'center', 'tray'];
const SERVER_MODES: SpeedServerMode[] = ['auto', 'netgauge', 'cloudflare', 'custom'];

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

/** A plain `{x,y,width,height}` box, or null when the input is unusable. */
function rect(value: unknown): Rect | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const x = num(r.x, Number.NaN, -100_000, 100_000);
  const y = num(r.y, Number.NaN, -100_000, 100_000);
  const width = num(r.width, Number.NaN, 0, 100_000);
  const height = num(r.height, Number.NaN, 0, 100_000);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
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
      width: num(w.width, d.widget.width, 160, 720),
      scale: num(w.scale, d.widget.scale, 0.7, 1.8),
      position,
      showSparkline: bool(w.showSparkline, d.widget.showSparkline),
      showPeak: bool(w.showPeak, d.widget.showPeak),
      showAdapter: bool(w.showAdapter, d.widget.showAdapter),
      layout: oneOf(w.layout, WIDGET_LAYOUTS, d.widget.layout),
      dock: oneOf(w.dock, WIDGET_DOCKS, d.widget.dock),
      dockEdge: oneOf(w.dockEdge, TASKBAR_EDGES, d.widget.dockEdge),
      dockAlign: oneOf(w.dockAlign, DOCK_ALIGNS, d.widget.dockAlign),
      dockOffsetX: Math.round(num(w.dockOffsetX, d.widget.dockOffsetX, -4000, 4000)),
      dockOffsetY: Math.round(num(w.dockOffsetY, d.widget.dockOffsetY, -400, 400)),
      dockGap: Math.round(num(w.dockGap, d.widget.dockGap, 0, 200)),
      dockThickness: Math.round(num(w.dockThickness, d.widget.dockThickness, 24, 120)),
      dockAutoHide: w.dockAutoHide === 'keep' ? 'keep' : 'follow',
      startButton: rect(w.startButton),
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
      server: oneOf(s.server, SERVER_MODES, d.speedTest.server),
      serverUrl: typeof s.serverUrl === 'string' ? s.serverUrl.replace(/\/+$/, '') : d.speedTest.serverUrl,
      concurrency: Math.round(num(s.concurrency, d.speedTest.concurrency, 1, 16)),
      phaseDurationMs: Math.round(num(s.phaseDurationMs, d.speedTest.phaseDurationMs, 2000, 60_000)),
      measureLoadedLatency: bool(s.measureLoadedLatency, d.speedTest.measureLoadedLatency),
      adaptiveChunks: bool(s.adaptiveChunks, d.speedTest.adaptiveChunks),
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
  widgetMetrics: 'ng:widget:metrics',
  widgetResize: 'ng:widget:resize',
  taskbarProbe: 'ng:taskbar:probe',
  taskbarLayout: 'ng:taskbar:layout',
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
  /** Set when the settings file on disk had to be rejected/discarded. */
  settingsError?: string;
}

/** What `window.netgauge` exposes to the renderer. */
export interface NetGaugeApi {
  getSettings(): Promise<NetGaugeSettings>;
  setSettings(patch: SettingsPatch): Promise<NetGaugeSettings>;
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
  /** Re-run the Windows taskbar geometry probe (Studio → Widget → Detect). */
  probeTaskbar(): Promise<TaskbarProbeResult>;
  /** Current widget size as computed by the shared metrics helper. */
  getWidgetMetrics(): Promise<WidgetMetrics>;
  /** The widget renderer reporting its natural content size. */
  reportWidgetSize(width: number, height: number): Promise<void>;
}

export interface TaskbarProbeResult {
  layout: {
    rect: Rect;
    edge: 'bottom' | 'top' | 'left' | 'right';
    thickness: number;
    autoHide: boolean;
    alignment: 'left' | 'center';
    startButton: Rect | null;
    source: 'uia' | 'workArea';
  } | null;
  rect: Rect | null;
  metrics: WidgetMetrics;
}

/**
 * Public servers a NetGauge client can measure against without hosting anything.
 *
 * - `netgauge` speaks the four `/api/speed/*` routes in apps/web.
 * - `cloudflare` is Cloudflare's public speed endpoint — the same one their own
 *   browser test and `@cloudflare/speedtest` use. It needs no key and allows
 *   cross-origin GET/POST, which makes it a reliable default when no NetGauge
 *   server is reachable.
 */
export const CLOUDFLARE_SPEED_URL = 'https://speed.cloudflare.com';

export const SPEED_SERVER_PRESETS = [
  { id: 'auto', label: 'Automatic', note: 'NetGauge server if reachable, otherwise Cloudflare' },
  { id: 'netgauge', label: 'NetGauge server', note: 'The app that serves this client (/api/speed/*)' },
  { id: 'cloudflare', label: 'Cloudflare', note: 'speed.cloudflare.com — public, worldwide anycast' },
  { id: 'custom', label: 'Custom URL', note: 'Any server implementing the NetGauge speed API' },
] as const;

export interface ResolvedSpeedServer {
  kind: 'netgauge' | 'cloudflare' | 'custom';
  baseUrl: string;
  label: string;
  paths?: { ping?: string; download?: string; upload?: string; meta?: string };
}

/**
 * Turns the user's server preference into a concrete endpoint. `auto` prefers a
 * NetGauge server reachable from the current page (so the numbers match the web
 * client) and never falls back to a hostname that does not resolve.
 */
export function resolveSpeedServer(
  settings: NetGaugeSettings,
  env: { netgaugeBaseUrl?: string } = {},
): ResolvedSpeedServer {
  const mode = settings.speedTest.server;
  const custom = settings.speedTest.serverUrl.trim();
  if (mode === 'custom' && custom) return { kind: 'custom', baseUrl: custom, label: custom };
  if (mode === 'cloudflare') {
    return {
      kind: 'cloudflare',
      baseUrl: CLOUDFLARE_SPEED_URL,
      label: 'Cloudflare',
      paths: { ping: '/__down?bytes=0', download: '/__down', upload: '/__up', meta: '/meta' },
    };
  }
  if (mode === 'netgauge' || mode === 'auto') {
    const base = env.netgaugeBaseUrl ?? custom;
    if (base) return { kind: 'netgauge', baseUrl: base, label: 'NetGauge server' };
    if (mode === 'netgauge') return { kind: 'netgauge', baseUrl: '', label: 'This page' };
    return {
      kind: 'cloudflare',
      baseUrl: CLOUDFLARE_SPEED_URL,
      label: 'Cloudflare',
      paths: { ping: '/__down?bytes=0', download: '/__down', upload: '/__up', meta: '/meta' },
    };
  }
  return { kind: 'custom', baseUrl: custom, label: custom || 'Speed server' };
}

/** Maps Cloudflare's `/meta` payload onto the fields NetGauge displays. */
export function mapCloudflareMeta(raw: unknown): Partial<ServerMeta> | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);
  const location = [str(m.city), str(m.region)].filter(Boolean).join(', ');
  return {
    host: str(m.hostname) ?? 'speed.cloudflare.com',
    name: 'Cloudflare Edge',
    location: location || undefined,
    country: str(m.country) ?? str(m.colo),
    ip: str(m.clientIp),
    isp: str(m.asOrganization),
    serverTime: typeof m.timestamp === 'string' ? Date.parse(m.timestamp) : undefined,
  };
}

export type WidgetLayoutResolved = 'card' | 'taskbar';

/** Which visual layout the widget should use, resolving `auto`. */
export function widgetLayoutOf(settings: NetGaugeSettings): WidgetLayoutResolved {
  if (settings.widget.layout === 'card') return 'card';
  if (settings.widget.layout === 'taskbar') return 'taskbar';
  return settings.widget.dock === 'taskbar' ? 'taskbar' : 'card';
}

export interface WidgetMetrics {
  layout: WidgetLayoutResolved;
  /** Outer size in device pixels, already scaled. */
  width: number;
  height: number;
}

/**
 * The single source of truth for the widget window size. The main process sizes the
 * BrowserWindow with this and the renderer lays out to `100%`, so the two can never
 * disagree — which is what used to clip the bottom of the widget.
 */
export function widgetMetrics(settings: NetGaugeSettings): WidgetMetrics {
  const w = settings.widget;
  const scale = w.scale;
  const width = Math.round(w.width * scale);
  if (widgetLayoutOf(settings) === 'taskbar') {
    return { layout: 'taskbar', width, height: Math.round(w.dockThickness * scale) };
  }
  // Mirrors the spacings used by views/Widget.tsx (card variant).
  const header = 22;
  const down = 34;
  const up = 22;
  const gaps = 8 + 2 + 8;
  const spark = w.showSparkline ? 46 + 6 : 0;
  const footer = w.showAdapter || w.showPeak ? 15 + 6 : 0;
  const padding = 14 * 2;
  const height = Math.round((header + down + up + gaps + spark + footer + padding) * scale);
  return { layout: 'card', width, height: Math.round(Math.min(Math.max(height, 120), 420)) };
}
