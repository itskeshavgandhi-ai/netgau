import { app, ipcMain, BrowserWindow, type BrowserWindow as BrowserWindowType } from 'electron';
import { CHANNELS, type AdapterInfo, type AppInfo, type NetGaugeSettings, type ViewName, type WindowAction } from '../shared/bridge';
import type { SettingsStore } from './settings';

export interface IpcDeps {
  store: SettingsStore;
  getAdapters: () => Promise<AdapterInfo[]>;
  setPaused: (paused: boolean) => void;
  windowAction: (action: WindowAction, value: boolean | undefined, win: BrowserWindowType | undefined) => void;
  openView: (view: ViewName) => void;
  setLoginItem: (enabled: boolean) => void;
  relaunchWindows: () => void;
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(CHANNELS.settingsGet, () => deps.store.get());

  ipcMain.handle(CHANNELS.settingsSet, (_event, patch: Partial<NetGaugeSettings>) =>
    deps.store.update({ ...deps.store.get(), ...patch } as NetGaugeSettings),
  );

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

  ipcMain.handle(CHANNELS.appInfo, (): AppInfo => {
    const settings = deps.store.get();
    void settings;
    return {
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron ?? 'unknown',
      chrome: process.versions.chrome ?? 'unknown',
      node: process.versions.node,
      isPackaged: app.isPackaged,
      simulated: false,
    };
  });
}
