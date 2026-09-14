import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CHANNELS, type NetGaugeApi, type NetGaugeSettings, type LiveSample, type ViewName } from '../shared/bridge';

function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: NetGaugeApi = {
  getSettings: () => ipcRenderer.invoke(CHANNELS.settingsGet),
  setSettings: (patch: Partial<NetGaugeSettings>) => ipcRenderer.invoke(CHANNELS.settingsSet, patch),
  onSettings: (handler) => subscribe<NetGaugeSettings>(CHANNELS.settingsChanged, handler),
  onSample: (handler) => subscribe<LiveSample>(CHANNELS.sample, handler),
  getAdapters: () => ipcRenderer.invoke(CHANNELS.adapters),
  setPaused: (paused) => ipcRenderer.invoke(CHANNELS.setPaused, paused),
  window: (action, value) => ipcRenderer.invoke(CHANNELS.windowAction, action, value),
  openView: (view) => ipcRenderer.invoke(CHANNELS.openView, view),
  onOpenView: (handler) => subscribe<ViewName>(CHANNELS.openViewRequest, handler),
  getAppInfo: () => ipcRenderer.invoke(CHANNELS.appInfo),
  setLoginItem: (enabled) => ipcRenderer.invoke(CHANNELS.loginItem, enabled),
  relaunchWindow: () => ipcRenderer.invoke(CHANNELS.relaunchWindow),
};

contextBridge.exposeInMainWorld('netgauge', api);
