/**
 * Windows taskbar geometry, and the maths that parks the NetGauge widget inside it.
 *
 * The taskbar is not a documented API surface, so this module works in two layers:
 *
 * 1. **Detection** — a one-shot PowerShell UI Automation probe reads the real
 *    `Shell_TrayWnd` / `StartButton` rectangles, plus the `TaskbarAl` registry value
 *    that says whether the icons are left-aligned (Windows 10 style) or centred
 *    (Windows 11 default). This runs rarely (on demand and every few seconds) and the
 *    result is cached in settings.
 * 2. **Pure maths** — `dockRect()` turns a detected layout plus the user's alignment
 *    choice and px nudges into an exact window rectangle. It has no Electron or OS
 *    dependency, so every edge case is unit-tested.
 *
 * Everything degrades gracefully: if the probe is unavailable (non-Windows, locked
 * down PowerShell, remote session), `inferLayoutFromWorkArea()` derives the taskbar
 * strip from the display's work area and `estimateStartButton()` guesses where the
 * Start button sits. The user's manual nudge always wins.
 */

import { spawn } from 'node:child_process';
import { screen } from 'electron';
import { widgetMetrics, type NetGaugeSettings, type Rect, type TaskbarEdge } from '../shared/bridge';

export type ResolvedEdge = 'bottom' | 'top' | 'left' | 'right';
export type TaskbarAlignment = 'left' | 'center';

export interface TaskbarLayout {
  /** The taskbar strip in screen coordinates. */
  rect: Rect;
  edge: ResolvedEdge;
  /** Strip thickness: height for horizontal edges, width for vertical ones. */
  thickness: number;
  autoHide: boolean;
  alignment: TaskbarAlignment;
  /** Real Start-button rectangle, when UI Automation could read it. */
  startButton: Rect | null;
  source: 'uia' | 'workArea';
}

const PROBE_TIMEOUT_MS = 4000;
const DEFAULT_THICKNESS = 48;
/** Windows 11 cluster geometry: icons are 48 px wide and the group is centred. */
const WIN11_ICON = 48;
const WIN11_CLUSTER_ICONS = 5;

/**
 * Reads the taskbar and Start button from the OS. Returns `null` on any platform or
 * environment where that is not possible, so callers fall back to an estimate.
 */
export function parseUiaProbe(text: string): {
  tray?: Rect;
  start?: Rect;
  alignment?: TaskbarAlignment;
} {
  const out: { tray?: Rect; start?: Rect; alignment?: TaskbarAlignment } = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [tag, ...rest] = trimmed.split(/\s+/);
    if (tag === 'TRAY' || tag === 'START') {
      const [x, y, width, height] = rest.map((n) => Number(n));
      if ([x, y, width, height].every((n) => Number.isFinite(n)) && (width ?? 0) > 0 && (height ?? 0) > 0) {
        const box: Rect = { x: Math.round(x!), y: Math.round(y!), width: Math.round(width!), height: Math.round(height!) };
        if (tag === 'TRAY') out.tray = box;
        else out.start = box;
      }
    } else if (tag === 'ALIGN') {
      const value = Number(rest[0]);
      if (value === 0) out.alignment = 'left';
      else if (value === 1) out.alignment = 'center';
    }
  }
  return out;
}

const UIA_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'Shell_TrayWnd')
$tray = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
if ($tray -ne $null) {
  $r = $tray.Current.BoundingRectangle
  if ($r.Width -gt 0 -and $r.Height -gt 0) {
    'TRAY {0} {1} {2} {3}' -f [int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height
  }
  $start = $tray.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'StartButton')))
  if ($start -eq $null) {
    $start = $tray.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Start')))
  }
  if ($start -ne $null) {
    $s = $start.Current.BoundingRectangle
    if ($s.Width -gt 0 -and $s.Height -gt 0) {
      'START {0} {1} {2} {3}' -f [int]$s.X, [int]$s.Y, [int]$s.Width, [int]$s.Height
    }
  }
}
$al = (Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced' -Name TaskbarAl -ErrorAction SilentlyContinue).TaskbarAl
if ($al -ne $null) { 'ALIGN {0}' -f [int]$al }
`;

/** Runs the UI Automation probe. Never rejects; a failure just returns `null`. */
export function probeTaskbarWithUia(): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    try {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', UIA_SCRIPT],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      let out = '';
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        out += chunk;
      });
      child.on('error', () => finish(null));
      child.on('close', () => finish(out.trim() ? out : null));
      setTimeout(() => {
        child.kill();
        finish(out.trim() ? out : null);
      }, PROBE_TIMEOUT_MS);
    } catch {
      finish(null);
    }
  });
}

function edgeThickness(bounds: Rect, workArea: Rect): { edge: ResolvedEdge; thickness: number } {
  const gaps: Array<{ edge: ResolvedEdge; value: number }> = [
    { edge: 'bottom', value: bounds.y + bounds.height - (workArea.y + workArea.height) },
    { edge: 'top', value: workArea.y - bounds.y },
    { edge: 'left', value: workArea.x - bounds.x },
    { edge: 'right', value: bounds.x + bounds.width - (workArea.x + workArea.width) },
  ];
  const best = gaps.reduce((a, b) => (b.value > a.value ? b : a));
  if (best.value >= 2) return { edge: best.edge, thickness: Math.round(best.value) };
  // Work area equals the display bounds: the taskbar is hidden (auto-hide) or on
  // another monitor. Assume the Windows default.
  return { edge: 'bottom', thickness: DEFAULT_THICKNESS };
}

/** Derives the taskbar strip from the primary display's work area. */
export function inferLayoutFromWorkArea(
  bounds: Rect,
  workArea: Rect,
  options: { alignment?: TaskbarAlignment; startButton?: Rect | null } = {},
): TaskbarLayout {
  const { edge, thickness } = edgeThickness(bounds, workArea);
  const rect: Rect =
    edge === 'bottom'
      ? { x: bounds.x, y: bounds.y + bounds.height - thickness, width: bounds.width, height: thickness }
      : edge === 'top'
        ? { x: bounds.x, y: bounds.y, width: bounds.width, height: thickness }
        : edge === 'left'
          ? { x: bounds.x, y: bounds.y, width: thickness, height: bounds.height }
          : { x: bounds.x + bounds.width - thickness, y: bounds.y, width: thickness, height: bounds.height };
  const autoHide = Math.abs(workArea.height - bounds.height) < 2 && Math.abs(workArea.width - bounds.width) < 2;
  return {
    rect,
    edge,
    thickness,
    autoHide,
    alignment: options.alignment ?? 'center',
    startButton: options.startButton ?? null,
    source: 'workArea',
  };
}

/** Where the Start button sits when UI Automation could not tell us. */
export function estimateStartButton(rect: Rect, edge: ResolvedEdge, alignment: TaskbarAlignment): Rect {
  if (alignment === 'left') {
    // Windows 10 style: Start is the first thing on the taskbar.
    return edge === 'left' || edge === 'right'
      ? { x: rect.x, y: rect.y + 8, width: rect.width, height: WIN11_ICON }
      : { x: rect.x + 8, y: rect.y, width: WIN11_ICON, height: rect.height };
  }
  const cluster = WIN11_ICON * WIN11_CLUSTER_ICONS;
  if (edge === 'left' || edge === 'right') {
    const center = rect.y + rect.height / 2;
    return { x: rect.x, y: Math.round(center - cluster / 2), width: rect.width, height: WIN11_ICON };
  }
  const center = rect.x + rect.width / 2;
  return { x: Math.round(center - cluster / 2), y: rect.y, width: WIN11_ICON, height: rect.height };
}

export interface DockInput {
  /** Widget outer size in device pixels. */
  width: number;
  height: number;
  align: NetGaugeSettings['widget']['dockAlign'];
  offsetX: number;
  offsetY: number;
  gap: number;
}

/**
 * The rectangle the widget should occupy. Pure: same inputs, same output, so the
 * placement can be unit-tested without a taskbar.
 */
export function dockRect(layout: TaskbarLayout, input: DockInput): Rect {
  const horizontal = layout.edge === 'bottom' || layout.edge === 'top';
  const rect = layout.rect;
  const start = layout.startButton ?? estimateStartButton(rect, layout.edge, layout.alignment);
  const gap = Math.max(0, input.gap);

  if (horizontal) {
    const height = Math.max(20, Math.min(input.height, layout.thickness));
    const y = Math.round(rect.y + (layout.thickness - height) / 2 + input.offsetY);
    const width = Math.max(80, input.width);
    const beforeStart = Math.round(start.x - gap - width);
    const afterStart = Math.round(start.x + start.width + gap);
    let x: number;
    switch (input.align) {
      case 'before-start':
        // No room to the left of Start (Windows 10 layout, or a very wide widget):
        // sit just to its right instead of sliding off the screen.
        x = beforeStart >= rect.x + 4 ? beforeStart : afterStart;
        break;
      case 'after-start':
        x = afterStart;
        break;
      case 'start':
        x = rect.x + 8;
        break;
      case 'center':
        x = Math.round(rect.x + (rect.width - width) / 2);
        break;
      case 'tray':
        x = Math.round(rect.x + rect.width - width - 8);
        break;
    }
    const clampedX = Math.min(Math.max(x! + input.offsetX, rect.x - width + 24), rect.x + rect.width - 24);
    return { x: Math.round(clampedX), y, width, height };
  }

  // Vertical taskbar: stack the widget above the Start button.
  const width = Math.max(20, Math.min(input.width, layout.thickness));
  const x = Math.round(rect.x + (layout.thickness - width) / 2 + input.offsetX);
  const height = input.height;
  const beforeStart = Math.round(start.y - gap - height);
  const afterStart = Math.round(start.y + start.height + gap);
  let y: number;
  switch (input.align) {
    case 'before-start':
      y = beforeStart >= rect.y + 4 ? beforeStart : afterStart;
      break;
    case 'after-start':
      y = afterStart;
      break;
    case 'start':
      y = rect.y + 8;
      break;
    case 'center':
      y = Math.round(rect.y + (rect.height - height) / 2);
      break;
    case 'tray':
      y = Math.round(rect.y + rect.height - height - 8);
      break;
  }
  return { x, y: Math.round(y! + input.offsetY), width, height };
}

/** True when the widget should be hidden rather than repositioned. */
export function shouldHideForAutoHide(layout: TaskbarLayout, settings: NetGaugeSettings, onScreen: Rect): boolean {
  if (!layout.autoHide || settings.widget.dockAutoHide === 'keep') return false;
  const r = layout.rect;
  // An auto-hidden taskbar slides off the display; when it is mostly gone, so is the
  // widget. A "keep" user gets the last known spot instead.
  const visibleWidth = Math.max(0, Math.min(r.x + r.width, onScreen.x + onScreen.width) - Math.max(r.x, onScreen.x));
  const visibleHeight = Math.max(0, Math.min(r.y + r.height, onScreen.y + onScreen.height) - Math.max(r.y, onScreen.y));
  const visible = visibleWidth * visibleHeight;
  const total = Math.max(1, r.width * r.height);
  return visible / total < 0.5;
}

export interface TaskbarDockOptions {
  getSettings: () => NetGaugeSettings;
  onLayout?: (layout: TaskbarLayout) => void;
  /** Poll interval for taskbar changes (alignment, auto-hide, resolution). */
  intervalMs?: number;
}

/**
 * Keeps an up-to-date picture of the taskbar and hands out the rectangle the widget
 * should occupy. Cheap: the UI Automation probe only runs when the cheap work-area
 * check says something changed, or on an explicit refresh.
 */
export class TaskbarDock {
  private current: TaskbarLayout | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastProbeAt = 0;
  private lastSignature = '';

  constructor(private readonly options: TaskbarDockOptions) {}

  get layout(): TaskbarLayout | null {
    return this.current;
  }

  /** Cheap, synchronous snapshot used until a probe has run. */
  private fromWorkArea(): TaskbarLayout {
    const display = screen.getPrimaryDisplay();
    const bounds = display.bounds;
    const workArea = display.workArea;
    const cached = this.options.getSettings().widget.startButton;
    return inferLayoutFromWorkArea(bounds, workArea, {
      alignment: this.current?.alignment ?? 'center',
      startButton: cached,
    });
  }

  /**
   * Synchronous, probe-free snapshot from the work area. Gives the widget a sane
   * position immediately at startup without waiting on PowerShell.
   */
  seed(): TaskbarLayout {
    if (!this.current) {
      this.current = this.fromWorkArea();
      this.options.onLayout?.(this.current);
    }
    return this.current;
  }

  /**
   * Refreshes the layout. `force` runs the UI Automation probe even if nothing looks
   * different (used by the "Detect taskbar" button in Studio).
   *
   * Only one probe runs at a time: the periodic timer, display events and the Studio
   * button used to each spawn their own PowerShell, which piled up on slow machines.
   */
  refresh(force = false): Promise<TaskbarLayout> {
    if (this.inflight) return this.inflight;
    this.inflight = this.doRefresh(force).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private inflight: Promise<TaskbarLayout> | null = null;

  private async doRefresh(force: boolean): Promise<TaskbarLayout> {
    const base = this.fromWorkArea();
    const signature = `${base.rect.x},${base.rect.y},${base.rect.width},${base.rect.height},${base.autoHide}`;
    // Re-probe rarely: each probe is a fresh PowerShell + UI Automation load (~1 s CPU).
    const stale = Date.now() - this.lastProbeAt > 120_000;
    const shouldProbe = process.platform === 'win32' && (force || signature !== this.lastSignature || stale);

    if (shouldProbe && (force || !this.current || this.current.source !== 'uia' || stale || signature !== this.lastSignature)) {
      this.lastProbeAt = Date.now();
      const raw = await probeTaskbarWithUia();
      const parsed = raw ? parseUiaProbe(raw) : {};
      if (parsed.tray) {
        const display = screen.getPrimaryDisplay();
        const layout: TaskbarLayout = {
          rect: parsed.tray,
          edge: edgeThickness(
            { x: 0, y: 0, width: Math.max(parsed.tray.x + parsed.tray.width, display.bounds.width), height: Math.max(parsed.tray.y + parsed.tray.height, display.bounds.height) },
            display.workArea,
          ).edge,
          thickness: parsed.tray.height >= parsed.tray.width ? parsed.tray.width : parsed.tray.height,
          autoHide: Math.abs(display.workArea.width - display.bounds.width) < 2 && Math.abs(display.workArea.height - display.bounds.height) < 2,
          alignment: parsed.alignment ?? base.alignment,
          startButton: parsed.start ?? null,
          source: 'uia',
        };
        this.current = layout;
      } else if (!this.current) {
        this.current = base;
      }
    } else if (!this.current || signature !== this.lastSignature) {
      this.current = base;
    }

    this.lastSignature = signature;
    const layout = this.current ?? base;
    this.options.onLayout?.(layout);
    return layout;
  }

  /** The exact rectangle for the widget, or `null` when it should be hidden. */
  rect(): Rect | null {
    const layout = this.current;
    if (!layout) return null;
    const settings = this.options.getSettings();
    const display = screen.getPrimaryDisplay();
    if (shouldHideForAutoHide(layout, settings, display.bounds)) return null;
    const metrics = widgetMetrics(settings);
    return dockRect(layout, {
      width: metrics.width,
      height: metrics.height,
      align: settings.widget.dockAlign,
      offsetX: settings.widget.dockOffsetX,
      offsetY: settings.widget.dockOffsetY,
      gap: settings.widget.dockGap,
    });
  }

  start(): void {
    if (this.timer) return;
    const interval = this.options.intervalMs ?? 4000;
    this.timer = setInterval(() => void this.refresh(), interval);
    void this.refresh(true);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
