import { app, BrowserWindow, screen } from 'electron';
import { formatSpeed } from '@netgauge/core';
import { registerIpc } from './ipc';
import { Sampler, createReaderForPlatform, type CounterReader } from './sampler';
import { SettingsStore, loadSettings, settingsPath } from './settings';
import { TaskbarDock } from './taskbar';
import { NetGaugeTray } from './tray';
import { createStudioWindow } from './windows';
import { WidgetController } from './widget';
import {
  CHANNELS,
  widgetMetrics,
  type LiveSample,
  type NetGaugeSettings,
  type ViewName,
  type WindowAction,
} from '../shared/bridge';

const isWindows = process.platform === 'win32';

// Windows uses the AppUserModelID to group taskbar buttons and to allow notifications
// from an unpackaged (portable) build. Without it, toasts silently never appear.
if (isWindows) app.setAppUserModelId('app.netgauge.desktop');

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  let store: SettingsStore;
  let sampler: Sampler;
  let reader: CounterReader;
  let tray: NetGaugeTray;
  let studio: BrowserWindow | null = null;
  let quitting = false;
  let lowSince = 0;
  let notified = false;

  const settings = () => store.get();

  const dock = new TaskbarDock({
    getSettings: settings,
    onLayout: (layout) => {
      // Cache the real Start-button rectangle so the estimate improves even before
      // the next probe.
      if (layout.startButton) {
        const cached = settings().widget.startButton;
        const next = layout.startButton;
        if (!cached || cached.x !== next.x || cached.y !== next.y || cached.width !== next.width) {
          store.patch({ widget: { startButton: next } });
        }
      }
    },
    intervalMs: 4000,
  });

  const widget = new WidgetController({
    getSettings: settings,
    patch: (patch) => {
      store.patch({ widget: patch });
    },
    dock,
  });

  const broadcastSample = (sample: LiveSample) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(CHANNELS.sample, sample);
    }
    tray?.update(sample);
    watchForDrop(sample);
  };

  const watchForDrop = (sample: LiveSample) => {
    const s = settings();
    if (!s.behaviour.notifyOnDrop || s.monitor.paused) return;
    const threshold = s.behaviour.warnBelowMbps * 1e6;
    if (sample.smoothDownBps > 0 && sample.smoothDownBps < threshold) {
      if (lowSince === 0) lowSince = sample.t;
      if (!notified && sample.t - lowSince > 15_000) {
        notified = true;
        tray?.notify(
          'Connection looks slow',
          `Download has stayed under ${s.behaviour.warnBelowMbps} Mbps for 15 s (now ${formatSpeed(sample.smoothDownBps, s.monitor.unit).text}).`,
        );
      }
    } else {
      lowSince = 0;
      notified = false;
    }
  };

  const setPaused = (paused: boolean) => {
    store.patch({ monitor: { paused } });
    if (paused) {
      sampler.stopTimer();
      broadcastSample({
        t: Date.now(),
        downBps: 0,
        upBps: 0,
        totalBps: 0,
        smoothDownBps: 0,
        smoothUpBps: 0,
        rxBytes: 0,
        txBytes: 0,
        interfaces: [],
      });
    } else {
      sampler.reset();
      sampler.start();
    }
    tray?.rebuildMenu();
  };

  const applyLoginItem = (enabled: boolean) => {
    store.patch({ behaviour: { launchAtLogin: enabled } });
    if (isWindows || process.platform === 'darwin') {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath,
        args: isWindows ? ['--hidden'] : [],
      });
    }
    tray?.rebuildMenu();
  };

  const ensureStudio = () => {
    if (studio && !studio.isDestroyed()) return studio;
    studio = createStudioWindow(settings());
    studio.on('close', (event) => {
      if (settings().behaviour.minimizeToTray && !quitting) {
        event.preventDefault();
        studio?.hide();
      }
    });
    studio.on('closed', () => {
      studio = null;
    });
    return studio;
  };

  const openView = (view: ViewName) => {
    if (view === 'widget') {
      widget.ensure();
      return;
    }
    ensureStudio();
    studio?.webContents.send(CHANNELS.openViewRequest, view);
    studio?.show();
    studio?.focus();
  };

  const destroyStudio = () => {
    if (studio && !studio.isDestroyed()) studio.destroy();
    studio = null;
  };

  const windowAction = (action: WindowAction, value: boolean | undefined, win: BrowserWindow | undefined) => {
    const target = win ?? studio;
    switch (action) {
      case 'minimize':
        target?.minimize();
        break;
      case 'hide':
        target?.hide();
        break;
      case 'close':
        if (settings().behaviour.minimizeToTray && !quitting) target?.hide();
        else if (target === studio) destroyStudio();
        else target?.close();
        break;
      case 'always-on-top': {
        const enabled = value ?? !(target?.isAlwaysOnTop() ?? false);
        target?.setAlwaysOnTop(enabled, 'screen-saver');
        if (target === widget.window) store.patch({ widget: { alwaysOnTop: enabled } });
        tray?.rebuildMenu();
        break;
      }
    }
  };

  /**
   * The window material can only be chosen at construction time, so a material or
   * theme change rebuilds the window it belongs to. The Studio only needs a rebuild
   * when its background colour changes; the widget when its glass mode does.
   */
  const relaunchWindows = () => {
    const showStudio = studio !== null && !studio.isDestroyed();
    destroyStudio();
    if (showStudio) openView('studio');
    widget.recreate();
  };

  const repositionWidget = () => {
    widget.apply(settings());
  };

  app.on('second-instance', () => openView('studio'));

  app.whenReady().then(async () => {
    const file = settingsPath(app.getPath('userData'));
    const loaded = loadSettings(file);
    store = new SettingsStore(file, loaded);
    if (loaded.error) console.warn(`[NetGauge] Reset corrupt settings: ${loaded.error}`);

    const initial = settings();
    reader = createReaderForPlatform(process.platform, initial.monitor.sampleMs);
    sampler = new Sampler({
      reader,
      intervalMs: initial.monitor.sampleMs,
      adapter: initial.monitor.adapter,
      includeVirtual: initial.monitor.includeVirtual,
      smoothing: initial.monitor.smoothing,
      onSample: broadcastSample,
    });

    await dock.refresh(true);

    tray = new NetGaugeTray(settings, {
      openStudio: () => openView('studio'),
      runSpeedTest: () => openView('test'),
      toggleWidget: () => {
        const enabled = !settings().widget.enabled;
        store.patch({ widget: { enabled } });
        if (enabled) widget.ensure();
        else widget.window?.hide();
        tray?.rebuildMenu();
      },
      togglePaused: () => setPaused(!settings().monitor.paused),
      setUnit: (unit) => {
        store.patch({ monitor: { unit } });
        tray?.rebuildMenu();
      },
      toggleAlwaysOnTop: () => windowAction('always-on-top', !settings().widget.alwaysOnTop, widget.window ?? undefined),
      toggleLoginItem: () => applyLoginItem(!settings().behaviour.launchAtLogin),
      redock: () => {
        widget.resetDock();
        void dock.refresh(true).then(repositionWidget);
      },
      quit: () => {
        quitting = true;
        app.quit();
      },
    });

    registerIpc({
      store,
      getAdapters: async () => {
        const counters = await sampler.readCounters();
        return counters.map((c) => ({ name: c.name, rxBytes: c.rxBytes, txBytes: c.txBytes }));
      },
      setPaused,
      windowAction,
      openView,
      setLoginItem: applyLoginItem,
      relaunchWindows,
      probeTaskbar: async () => {
        const layout = await dock.refresh(true);
        return { layout, rect: dock.rect(), metrics: widgetMetrics(settings()) };
      },
      widgetResize: (width, height) => widget.resizeToContent(width, height),
    });

    store.onChange((next) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(CHANNELS.settingsChanged, next);
      }
      widget.apply(next);
      sampler.setOptions({
        intervalMs: next.monitor.sampleMs,
        adapter: next.monitor.adapter,
        includeVirtual: next.monitor.includeVirtual,
        smoothing: next.monitor.smoothing,
      });
      tray?.rebuildMenu();
    });

    // Restore the login-item state so the tray checkbox is never a lie.
    if (isWindows || process.platform === 'darwin') {
      const actual = app.getLoginItemSettings().openAtLogin;
      if (actual !== initial.behaviour.launchAtLogin) {
        store.patch({ behaviour: { launchAtLogin: actual } });
      }
    }

    if (!initial.monitor.paused) sampler.start();

    const hidden = process.argv.includes('--hidden') || initial.behaviour.startHidden;
    if (!hidden) openView('studio');
    widget.ensure();
    dock.start();

    screen.on('display-metrics-changed', () => {
      void dock.refresh(true).then(repositionWidget);
    });
    screen.on('display-added', () => void dock.refresh(true).then(repositionWidget));
    screen.on('display-removed', () => void dock.refresh(true).then(repositionWidget));
  });

  // NetGauge lives in the tray (and, when docked, on the taskbar): closing every
  // window is not a reason to exit. Quit comes from the tray menu.
  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return;
    if (quitting) app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    dock.stop();
    sampler?.stop();
    tray?.destroy();
    widget.destroy();
  });

  app.on('activate', () => openView('studio'));
}
