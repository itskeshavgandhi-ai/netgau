import { BrowserWindow, screen, shell } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GlassMode, NetGaugeSettings, ViewName } from '../shared/bridge';

const PRELOAD = join(__dirname, '../preload/index.js');
const RENDERER_HTML = join(__dirname, '../renderer/index.html');

function rendererUrl(view: ViewName): string {
  const dev = process.env.NETGAUGE_DEV_SERVER;
  return dev ? `${dev.replace(/\/$/, '')}/#${view}` : `${pathToFileURL(RENDERER_HTML).href}#/${view}`;
}

interface MaterialOptions {
  transparent: boolean;
  backgroundColor: string;
  backgroundMaterial?: 'none' | 'mica' | 'acrylic' | 'tabbed';
  vibrancy?: 'under-window' | 'fullscreen-ui';
}

/**
 * Maps the user's glass setting onto the right platform mechanism.
 * Windows 11 gets a real compositor material; everywhere else we fall back to a
 * transparent surface that the renderer blurs itself.
 */
export function materialFor(glass: GlassMode): MaterialOptions {
  // `process.getSystemVersion` is Electron-only (returns e.g. "11.0.22631").
  const systemVersion = (process as { getSystemVersion?: () => string }).getSystemVersion?.() ?? '';
  const major = Number.parseInt(systemVersion.split('.')[0] ?? '10', 10);
  const isWin11 = process.platform === 'win32' && Number.isFinite(major) && major >= 11;
  if (process.platform === 'win32' && isWin11) {
    if (glass === 'acrylic') return { transparent: false, backgroundColor: '#00000000', backgroundMaterial: 'acrylic' };
    if (glass === 'mica') return { transparent: false, backgroundColor: '#00000000', backgroundMaterial: 'mica' };
    if (glass === 'solid') return { transparent: false, backgroundColor: '#0b1120' };
    return { transparent: false, backgroundColor: '#00000000', backgroundMaterial: 'none' };
  }
  if (process.platform === 'darwin' && glass !== 'solid') {
    return { transparent: true, backgroundColor: '#00000000', vibrancy: 'under-window' };
  }
  if (glass === 'solid') return { transparent: false, backgroundColor: '#0b1120' };
  return { transparent: true, backgroundColor: '#00000000' };
}

const basePreferences: Electron.WebPreferences = {
  preload: PRELOAD,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,
  spellcheck: false,
};

export function createStudioWindow(settings: NetGaugeSettings): BrowserWindow {
  const material = materialFor(settings.appearance.glass);
  const win = new BrowserWindow({
    width: 1080,
    height: 740,
    minWidth: 880,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    ...material,
    webPreferences: basePreferences,
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  void win.loadURL(rendererUrl('studio'));
  return win;
}

export function createWidgetWindow(settings: NetGaugeSettings): BrowserWindow {
  const material = materialFor(settings.appearance.glass);
  const width = Math.round(settings.widget.width * settings.widget.scale);
  const height = Math.round(230 * settings.widget.scale);
  const { workArea } = screen.getPrimaryDisplay();

  const win = new BrowserWindow({
    width,
    height,
    x: settings.widget.position?.x ?? workArea.x + workArea.width - width - 24,
    y: settings.widget.position?.y ?? workArea.y + 24,
    frame: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: settings.widget.alwaysOnTop,
    ...material,
    webPreferences: { ...basePreferences },
  });

  win.setAlwaysOnTop(settings.widget.alwaysOnTop, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (settings.widget.clickThrough) win.setIgnoreMouseEvents(true, { forward: true });
  void win.loadURL(rendererUrl('widget'));
  return win;
}

export function loadView(win: BrowserWindow, view: ViewName): void {
  void win.loadURL(rendererUrl(view));
}
