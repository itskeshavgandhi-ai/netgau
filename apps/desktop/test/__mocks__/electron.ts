/**
 * Minimal Electron stub so main-process modules can be unit-tested in Node.
 * Vitest aliases `electron` to this file (see vitest.config.mts).
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const app = {
  name: 'NetGauge',
  isPackaged: false,
  getVersion: () => '0.1.0-test',
  getName: () => 'NetGauge',
  getPath: (name: string) => join(tmpdir(), 'netgauge-test', name),
  setPath: () => undefined,
  whenReady: () => Promise.resolve(),
  on: () => app,
  once: () => app,
  quit: () => undefined,
  exit: () => undefined,
  relaunch: () => undefined,
  requestSingleInstanceLock: () => true,
  setLoginItemSettings: () => undefined,
  getLoginItemSettings: () => ({ openAtLogin: false, openAsHidden: false }),
  commandLine: { appendSwitch: () => undefined },
};

const windows: BrowserWindow[] = [];

export class BrowserWindow {
  static getAllWindows = () => windows;
  static fromWebContents = () => windows[0];

  destroyed = false;
  alwaysOnTop = false;
  ignoreMouseEvents = false;
  shown = false;
  size = [1080, 740] as [number, number];
  position = [0, 0] as [number, number];
  webContents = {
    send: () => undefined,
    setWindowOpenHandler: () => undefined,
  };

  constructor(public readonly options: Record<string, unknown> = {}) {
    windows.push(this);
  }

  loadURL = async () => undefined;
  show = () => {
    this.shown = true;
  };
  hide = () => {
    this.shown = false;
  };
  close = () => undefined;
  destroy = () => {
    this.destroyed = true;
  };
  isDestroyed = () => this.destroyed;
  minimize = () => undefined;
  focus = () => undefined;
  setAlwaysOnTop = (value: boolean) => {
    this.alwaysOnTop = value;
  };
  isAlwaysOnTop = () => this.alwaysOnTop;
  setIgnoreMouseEvents = (value: boolean) => {
    this.ignoreMouseEvents = value;
  };
  setSize = (width: number, height: number) => {
    this.size = [width, height];
  };
  getSize = () => this.size;
  setContentSize = (width: number, height: number) => {
    this.size = [width, height];
  };
  getContentSize = () => this.size;
  getPosition = () => this.position;
  setPosition = (x: number, y: number) => {
    this.position = [x, y];
  };
  getBounds = () => ({
    x: this.position[0] ?? 0,
    y: this.position[1] ?? 0,
    width: this.size[0] ?? 0,
    height: this.size[1] ?? 0,
  });
  isVisible = () => this.shown;
  showInactive = () => {
    this.shown = true;
  };
  setVisibleOnAllWorkspaces = () => undefined;
  setFocusable = () => undefined;
  on = () => this;
  once = () => this;
}

export class Tray {
  tooltip = '';
  image: unknown = null;
  menu: unknown = null;
  constructor(image: unknown) {
    this.image = image;
  }
  setToolTip = (tooltip: string) => {
    this.tooltip = tooltip;
  };
  setImage = (image: unknown) => {
    this.image = image;
  };
  setContextMenu = (menu: unknown) => {
    this.menu = menu;
  };
  displayBalloon = () => undefined;
  on = () => this;
  destroy = () => undefined;
}

export const ipcMain = {
  handle: () => undefined,
  on: () => undefined,
  removeHandler: () => undefined,
};

export const Menu = {
  buildFromTemplate: (template: unknown) => ({ template }),
  setApplicationMenu: () => undefined,
};

export const nativeImage = {
  createFromBuffer: (buffer: Buffer, options?: { width?: number; height?: number }) => ({
    buffer,
    width: options?.width,
    height: options?.height,
    isEmpty: () => buffer.length === 0,
    setTemplateImage: () => undefined,
  }),
};

export const screen = {
  getPrimaryDisplay: () => ({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    workAreaSize: { width: 1920, height: 1040 },
    scaleFactor: 1,
  }),
  getDisplayMatching: () => ({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    workAreaSize: { width: 1920, height: 1040 },
    scaleFactor: 1,
  }),
  on: () => undefined,
};

export const shell = { openExternal: async () => true };

export const nativeTheme = { shouldUseDarkColors: true, on: () => undefined };

export class Notification {
  static isSupported = () => true;
  shown = false;
  constructor(public readonly options: Record<string, unknown> = {}) {}
  show = () => {
    this.shown = true;
  };
}

export const contextBridge = { exposeInMainWorld: () => undefined };

export const ipcRenderer = {
  invoke: async () => undefined,
  on: () => undefined,
  removeListener: () => undefined,
  send: () => undefined,
};

export default { app, BrowserWindow, Tray, ipcMain, Menu, nativeImage, screen, shell, contextBridge, ipcRenderer, nativeTheme, Notification };
