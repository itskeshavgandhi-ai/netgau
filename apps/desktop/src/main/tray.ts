import { Menu, Tray, nativeImage, app } from 'electron';
import { formatLatency, formatSpeed, renderTrayIcon, trayTooltip } from '@netgauge/core';
import { hexToRgb, type LiveSample, type NetGaugeSettings, type UnitMode } from '../shared/bridge';

export interface TrayActions {
  openStudio(): void;
  runSpeedTest(): void;
  toggleWidget(): void;
  togglePaused(): void;
  setUnit(unit: UnitMode): void;
  toggleAlwaysOnTop(): void;
  toggleLoginItem(): void;
  quit(): void;
}

const ICON_SIZE = 16;
const MIN_REDRAW_MS = 220;

/**
 * The tray icon is rendered from the current sample rather than swapped between
 * pre-baked PNGs, so it always matches the user's accent colour and shows real
 * signal strength.
 */
export class NetGaugeTray {
  private tray: Tray | null = null;
  private lastDraw = 0;
  private lastLevel = -1;

  constructor(
    private readonly getSettings: () => NetGaugeSettings,
    private readonly actions: TrayActions,
  ) {
    this.create();
  }

  private create(): void {
    const image = this.render(0, false);
    this.tray = new Tray(image);
    this.tray.setToolTip('NetGauge — starting…');
    this.tray.on('click', () => this.actions.openStudio());
    this.tray.on('double-click', () => this.actions.openStudio());
    this.rebuildMenu();
  }

  private render(level: number, paused: boolean) {
    const { data, width, height } = renderTrayIcon({
      size: ICON_SIZE,
      scale: 2,
      accent: hexToRgb(this.getSettings().appearance.accent),
      level,
      mode: paused ? 'paused' : 'bars',
    });
    const image = nativeImage.createFromBuffer(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      width,
      height,
    });
    if (process.platform === 'darwin') image.setTemplateImage(true);
    return image;
  }

  update(sample: LiveSample): void {
    if (!this.tray) return;
    const now = Date.now();
    if (now - this.lastDraw < MIN_REDRAW_MS) return;
    this.lastDraw = now;

    const settings = this.getSettings();
    const down = settings.monitor.paused ? 0 : sample.smoothDownBps;
    const up = settings.monitor.paused ? 0 : sample.smoothUpBps;
    const reference = Math.max(1, settings.monitor.referenceMbps) * 1e6;
    // Perceptual scaling: half the icon at a tenth of the reference speed.
    const level = Math.min(1, Math.sqrt(Math.max(down, up) / reference));

    if (Math.abs(level - this.lastLevel) > 0.02 || settings.monitor.paused) {
      this.lastLevel = level;
      this.tray.setImage(this.render(level, settings.monitor.paused));
    }

    this.tray.setToolTip(
      trayTooltip({
        down: formatSpeed(down, settings.monitor.unit).text,
        up: formatSpeed(up, settings.monitor.unit).text,
        iface: sample.interfaces[0],
        paused: settings.monitor.paused,
      }),
    );
  }

  rebuildMenu(): void {
    if (!this.tray) return;
    const settings = this.getSettings();
    const menu = Menu.buildFromTemplate([
      { label: 'Open NetGauge', click: () => this.actions.openStudio() },
      { label: 'Run speed test', click: () => this.actions.runSpeedTest() },
      { type: 'separator' },
      {
        label: settings.widget.enabled ? 'Hide widget' : 'Show widget',
        click: () => this.actions.toggleWidget(),
      },
      {
        label: settings.monitor.paused ? 'Resume monitoring' : 'Pause monitoring',
        click: () => this.actions.togglePaused(),
      },
      {
        label: 'Keep widget on top',
        type: 'checkbox',
        checked: settings.widget.alwaysOnTop,
        click: () => this.actions.toggleAlwaysOnTop(),
      },
      { type: 'separator' },
      {
        label: 'Units',
        submenu: (['bits', 'bytes'] as UnitMode[]).map((unit) => ({
          label: unit === 'bits' ? 'Megabits (Mbps)' : 'Megabytes (MB/s)',
          type: 'checkbox' as const,
          checked: settings.monitor.unit === unit,
          click: () => this.actions.setUnit(unit),
        })),
      },
      {
        label: `Sampling every ${settings.monitor.sampleMs} ms`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Launch at login',
        type: 'checkbox',
        checked: settings.behaviour.launchAtLogin,
        click: () => this.actions.toggleLoginItem(),
      },
      { label: `NetGauge v${app.getVersion()}`, enabled: false },
      { type: 'separator' },
      { label: 'Quit', click: () => this.actions.quit() },
    ]);
    this.tray.setContextMenu(menu);
  }

  notify(title: string, body: string): void {
    this.tray?.displayBalloon({ title, content: body });
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}

export { formatLatency };
