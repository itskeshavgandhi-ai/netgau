import { BrowserWindow, nativeTheme, screen, shell } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { widgetMetrics, type GlassMode, type NetGaugeSettings, type ViewName } from '../shared/bridge';

export const PRELOAD_PATH = join(__dirname, '../preload/index.js');
const RENDERER_HTML = join(__dirname, '../renderer/index.html');

export function rendererUrl(view: ViewName): string {
  const dev = process.env.NETGAUGE_DEV_SERVER;
  return dev ? `${dev.replace(/\/$/, '')}/#${view}` : `${pathToFileURL(RENDERER_HTML).href}#/${view}`;
}

export interface MaterialOptions {
  transparent: boolean;
  backgroundColor: string;
  backgroundMaterial?: 'none' | 'mica' | 'acrylic' | 'tabbed';
  vibrancy?: 'under-window' | 'fullscreen-ui';
}

/**
 * Maps a glass setting onto the right platform mechanism.
 *
 * Windows 11 gets a real compositor material; everywhere else we fall back to a
 * transparent surface that the renderer blurs itself (or paint a solid colour).
 * Only the *widget* uses this — the Studio window is always opaque, because a window
 * full of numbers must never be legible only through whatever is behind it.
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
    return { transparent: true, backgroundColor: '#00000000' };
  }
  if (process.platform === 'darwin' && glass !== 'solid' && glass !== 'transparent') {
    return { transparent: true, backgroundColor: '#00000000', vibrancy: 'under-window' };
  }
  if (glass === 'solid') return { transparent: false, backgroundColor: '#0b1120' };
  return { transparent: true, backgroundColor: '#00000000' };
}

/** The widget's material. Kept separate so the studio can never inherit the transparency. */
export function widgetMaterialFor(glass: GlassMode): MaterialOptions {
  return materialFor(glass);
}

/** Opaque studio background for the active theme. */
export function studioBackground(theme: NetGaugeSettings['appearance']['theme']): string {
  if (theme === 'light') return '#eef1f7';
  if (theme === 'system') {
    const shouldUseDark = (nativeTheme as { shouldUseDarkColors?: boolean } | undefined)?.shouldUseDarkColors ?? true;
    return shouldUseDark ? '#0b1120' : '#eef1f7';
  }
  return '#0b1120';
}

const basePreferences: Electron.WebPreferences = {
  preload: PRELOAD_PATH,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,
  spellcheck: false,
};

export function createStudioWindow(settings: NetGaugeSettings): BrowserWindow {
  const win = new BrowserWindow({
    width: 1080,
    height: 740,
    minWidth: 880,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    // Always opaque. The user asked for it, and it also removes the whole class of
    // "the window went black on wake" / "I can see my desktop through the numbers"
    // problems that compositor materials bring on mixed hardware.
    transparent: false,
    backgroundColor: studioBackground(settings.appearance.theme),
    webPreferences: { ...basePreferences },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  void win.loadURL(rendererUrl('studio'));
  return win;
}

/** Where a free-floating widget should sit the first time it is shown. */
export function defaultWidgetPosition(width: number, height: number): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + workArea.width - width - 24),
    y: Math.round(workArea.y + workArea.height - height - 24),
  };
}
