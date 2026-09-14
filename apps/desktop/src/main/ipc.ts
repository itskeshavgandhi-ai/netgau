import { app, ipcMain, BrowserWindow, type BrowserWindow as BrowserWindowType } from 'electron';
import {
  CHANNELS,
  widgetMetrics,
  type AdapterInfo,
  type AppInfo,
  type SettingsPatch,
  type ViewName,
  type WindowAction,
} from '../shared/bridge';
import type { SettingsStore } from './settings';
import type { TaskbarLayout } from './taskbar';

export interface WidgetProbeResult {
  layout: TaskbarLayout | null;
  /** Where the widget lands with the *current* settings, in screen coordinates. */
  rect: { x: number; y: number; width: number; height: number } | null;
  metrics: { layout: 'card' | 'taskbar'; width: number; height: number };
}

export interface IpcDeps {
  store: SettingsStore;
  getAdapters: () => Promise<AdapterInfo[]>;
  setPaused: (paused: boolean) => void;
  windowAction: (action: WindowAction, value: boolean | undefined, win: BrowserWindowType | undefined) => void;
  openView: (view: ViewName) => void;
  setLoginItem: (enabled: boolean) => void;
  relaunchWindows: () => void;
  /** Re-runs the Windows taskbar geometry probe and returns the result. */
  probeTaskbar: () => Promise<WidgetProbeResult>;
  /** The widget renderer telling the main process how tall its content is. */
  widgetResize: (width: number, height: number) => void;
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(CHANNELS.settingsGet, () => deps.store.get());

  // A deep merge, not `{...current, ...patch}`: a patch that only mentions one
  // widget key must not reset the rest of that section to its defaults.
  ipcMain.handle(CHANNELS.settingsSet, (_event, patch: SettingsPatch) => deps.store.patch(patch));

  ipcMain.handle(CHANNELS.adapters, () => deps.getAdapters());

  ipcMain.handle(CHANNELS.setPaused, (_event, paused: boolean) => {
    deps.setPaused(Boolean(paused));
    return deps.store.get();
  });

  ipcMain.handle(CHANNELS.windowAction, (event, action: WindowAction, value?: boolean) => {
    deps.windowAction(action, value, BrowserWindow.fromWebContents(event.sender) ?? undefined);
  });

  ipcMain.handle(CHANNELS.openView, (_event, view: ViewName) => deps.openView(view));

  ipcMain.handle(CHANNELS.loginItem, (_event, enabled: boolean) => deps.setLoginItem(Boolean(enabled)));

  ipcMain.handle(CHANNELS.relaunchWindow, () => deps.relaunchWindows());

  ipcMain.handle(CHANNELS.taskbarProbe, () => deps.probeTaskbar());

  ipcMain.handle(CHANNELS.widgetMetrics, () => widgetMetrics(deps.store.get()));

  ipcMain.handle(CHANNELS.widgetResize, (_event, width: number, height: number) => {
    deps.widgetResize(Number(width) || 0, Number(height) || 0);
  });

  ipcMain.handle(CHANNELS.appInfo, (): AppInfo => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron ?? 'unknown',
      chrome: process.versions.chrome ?? 'unknown',
      node: process.versions.node,
      isPackaged: app.isPackaged,
      simulated: false,
      settingsError: deps.store.loadError,
    };
  });
}
