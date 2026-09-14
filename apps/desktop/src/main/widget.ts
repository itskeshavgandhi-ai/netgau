/**
 * Owns the widget window: creation, sizing, docking, and the drag-to-nudge gesture.
 *
 * Everything about the widget used to be spread across `windows.ts` and `index.ts`
 * with a hard-coded 230 px height. It now lives here, and every size comes from
 * `widgetMetrics()` in the shared contract so main and renderer cannot disagree.
 */

import { BrowserWindow, screen, shell } from 'electron';
import { widgetLayoutOf, widgetMetrics, type NetGaugeSettings, type Rect } from '../shared/bridge';
import { PRELOAD_PATH, defaultWidgetPosition, rendererUrl, widgetMaterialFor } from './windows';
import type { TaskbarDock } from './taskbar';

export interface WidgetControllerOptions {
  getSettings: () => NetGaugeSettings;
  /** Persist a widget-only patch (position, manual nudge, …). */
  patch: (patch: Partial<NetGaugeSettings['widget']>) => void;
  dock: TaskbarDock;
}

const MIN_CARD_HEIGHT = 90;
const MAX_CARD_HEIGHT = 480;

/** Electron hands back arrays; `noUncheckedIndexedAccess` makes destructuring a pain. */
function pair(values: number[]): [number, number] {
  return [values[0] ?? 0, values[1] ?? 0];
}

export class WidgetController {
  private win: BrowserWindow | null = null;
  private materialKey = '';
  /** True while we are moving the window ourselves, so 'move' is not read as a drag. */
  private applying = false;

  constructor(private readonly options: WidgetControllerOptions) {}

  get window(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  private get docked(): boolean {
    return this.options.getSettings().widget.dock === 'taskbar';
  }

  /** Window material can only be chosen when the window is constructed. */
  private materialKeyFor(settings: NetGaugeSettings): string {
    return settings.appearance.glass;
  }

  /** Creates the window if the widget is enabled and it does not exist yet. */
  ensure(): BrowserWindow | null {
    const settings = this.options.getSettings();
    if (!settings.widget.enabled) return null;
    const key = this.materialKeyFor(settings);
    if (this.window) {
      // Window material can only be chosen at construction time.
      if (key !== this.materialKey) {
        this.destroy();
      } else {
        this.apply(settings);
        return this.window;
      }
    }

    const metrics = widgetMetrics(settings);
    const material = widgetMaterialFor(settings.appearance.glass);
    const target = this.targetRect(settings);
    const fallback = defaultWidgetPosition(metrics.width, metrics.height);

    const win = new BrowserWindow({
      width: metrics.width,
      height: metrics.height,
      x: target?.x ?? settings.widget.position?.x ?? fallback.x,
      y: target?.y ?? settings.widget.position?.y ?? fallback.y,
      show: false,
      frame: false,
      transparent: material.transparent,
      backgroundColor: material.backgroundColor,
      ...(material.backgroundMaterial ? { backgroundMaterial: material.backgroundMaterial } : {}),
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: settings.widget.alwaysOnTop,
      focusable: true,
      title: 'NetGauge widget',
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
        transparent: material.transparent,
      },
    });

    this.win = win;
    this.materialKey = key;
    win.setAlwaysOnTop(settings.widget.alwaysOnTop, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(settings.widget.clickThrough, { forward: true });
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.on('move', () => this.captureManualPosition());
    win.on('moved', () => this.captureManualPosition());
    win.on('closed', () => {
      this.win = null;
    });
    win.once('ready-to-show', () => {
      if (!settings.widget.enabled) return;
      this.apply(this.options.getSettings());
      win.showInactive();
    });
    void win.loadURL(rendererUrl('widget'));
    return win;
  }

  /** Re-applies size, position, material flags and click-through from settings. */
  apply(settings: NetGaugeSettings): void {
    const win = this.window;
    if (!win) return;
    const metrics = widgetMetrics(settings);
    const [currentWidth, currentHeight] = pair(win.getContentSize());
    const docked = settings.widget.dock === 'taskbar';

    this.applying = true;
    try {
      if (currentWidth !== metrics.width || currentHeight !== metrics.height) {
        win.setContentSize(metrics.width, metrics.height);
      }
      const target = this.targetRect(settings);
      if (target) {
        const [x, y] = pair(win.getPosition());
        if (Math.abs(x - target.x) > 1 || Math.abs(y - target.y) > 1) win.setPosition(target.x, target.y, false);
      }
      win.setAlwaysOnTop(settings.widget.alwaysOnTop, 'screen-saver');
      win.setIgnoreMouseEvents(settings.widget.clickThrough, { forward: true });
      if (settings.widget.enabled) {
        if (docked && this.shouldHide(settings)) win.hide();
        else if (!win.isVisible()) win.showInactive();
      } else {
        win.hide();
      }
    } finally {
      // Release on the next tick: the move event is delivered asynchronously.
      setTimeout(() => {
        this.applying = false;
      }, 60);
    }
  }

  /** The rectangle the widget wants, or `null` when it is free-floating. */
  private targetRect(settings: NetGaugeSettings): Rect | null {
    if (settings.widget.dock !== 'taskbar') return null;
    const metrics = widgetMetrics(settings);
    return this.options.dock.rect() ?? {
      x: settings.widget.position?.x ?? 24,
      y: settings.widget.position?.y ?? 24,
      width: metrics.width,
      height: metrics.height,
    };
  }

  private shouldHide(settings: NetGaugeSettings): boolean {
    void settings;
    return this.options.dock.rect() === null;
  }

  /**
   * Dragging the widget is how people place it exactly. In docked mode the drop point
   * becomes an x/y nudge on top of the auto-detected spot, so it stays docked (and
   * keeps following the taskbar) instead of becoming a free-floating window.
   */
  private captureManualPosition(): void {
    const win = this.window;
    if (!win || this.applying) return;
    const [x, y] = pair(win.getPosition());
    const settings = this.options.getSettings();

    if (settings.widget.dock !== 'taskbar') {
      this.options.patch({ position: { x, y } });
      return;
    }

    const target = this.options.dock.rect();
    if (!target) return;
    this.options.patch({
      dockOffsetX: Math.round(settings.widget.dockOffsetX + (x - target.x)),
      dockOffsetY: Math.round(settings.widget.dockOffsetY + (y - target.y)),
    });
  }

  /** Called by the renderer when its content height changes (card layout). */
  resizeToContent(width: number, height: number): void {
    const win = this.window;
    if (!win) return;
    const settings = this.options.getSettings();
    if (settings.widget.dock === 'taskbar') return; // the dock owns the size
    const metrics = widgetMetrics(settings);
    const scale = settings.widget.scale || 1;
    const wantedHeight = Math.round(Math.min(Math.max(height / scale, MIN_CARD_HEIGHT), MAX_CARD_HEIGHT) * scale);
    const [currentWidth, currentHeight] = pair(win.getContentSize());
    const wantedWidth = Math.round(Math.max(width, metrics.width));
    if (Math.abs(currentHeight - wantedHeight) > 1 || Math.abs(currentWidth - wantedWidth) > 1) {
      this.applying = true;
      win.setContentSize(wantedWidth, wantedHeight);
      setTimeout(() => {
        this.applying = false;
      }, 60);
    }
  }

  /** Snap the widget back to the auto-detected spot (clears the manual nudge). */
  resetDock(): void {
    const settings = this.options.getSettings();
    this.options.patch({ dockOffsetX: 0, dockOffsetY: 0, position: null });
    this.apply({ ...settings, widget: { ...settings.widget, dockOffsetX: 0, dockOffsetY: 0, position: null } });
  }

  destroy(): void {
    const win = this.window;
    this.win = null;
    if (win) win.destroy();
  }

  /** Rebuilds the window (used when the widget material changes). */
  recreate(): void {
    this.destroy();
    this.ensure();
  }
}

/** The display the widget is currently on — used for bounds-safe positioning. */
export function displayFor(win: BrowserWindow | null) {
  if (!win) return screen.getPrimaryDisplay();
  return screen.getDisplayMatching(win.getBounds());
}
