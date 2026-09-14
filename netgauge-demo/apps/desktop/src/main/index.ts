import { app, BrowserWindow } from 'electron';
import { formatSpeed } from '@netgauge/core';
import { registerIpc } from './ipc';
import { Sampler, createReaderForPlatform, type CounterReader } from './sampler';
import { SettingsStore, loadSettings, settingsPath } from './settings';
import { NetGaugeTray } from './tray';
import { createStudioWindow, createWidgetWindow } from './windows';
import { CHANNELS, mergeSettings, type LiveSample, type NetGaugeSettings, type ViewName, type WindowAction } from '../shared/bridge';

const isWindows = process.platform === 'win32';
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  // A frameless transparent window needs the GPU compositor; disabling it here
  // avoids the black-rectangle bug some Windows 10 machines hit on wake.
  if (isWindows) app.commandLine.appendSwitch('disable-frame-rate-limit');

  let store: SettingsStore;
  let sampler: Sampler;
  let reader: CounterReader;
  let tray: NetGaugeTray;
  let studio: BrowserWindow | null = null;
  let widget: BrowserWindow | null = null;
  let quitting = false;
  let lowSince = 0;
  let notified = false;

  const settings = () => store.get();

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
    store.update(mergeSettings(settings(), { monitor: { paused } }));
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
    store.update(mergeSettings(settings(), { behaviour: { launchAtLogin: enabled } }));
    if (isWindows || process.platform === 'darwin') {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath,
        args: isWindows ? ['--hidden'] : [],
      });
    }
    tray?.rebuildMenu();
  };

  const openView = (view: ViewName) => {
    if (view === 'widget') {
      ensureWidget();
      widget?.focus();
      return;
    }
    ensureStudio();
    studio?.webContents.send(CHANNELS.openViewRequest, view);
    studio?.show();
    studio?.focus();
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

  const ensureWidget = () => {
    if (!settings().widget.enabled) return null;
    if (widget && !widget.isDestroyed()) return widget;
    widget = createWidgetWindow(settings());
    widget.on('moved', () => {
      if (!widget || widget.isDestroyed()) return;
      const [x, y] = widget.getPosition();
      store.update(mergeSettings(settings(), { widget: { position: { x, y } } }));
    });
    widget.on('closed', () => {
      widget = null;
    });
    return widget;
  };

  const destroyWindows = () => {
    for (const win of [studio, widget]) {
      if (win && !win.isDestroyed()) win.destroy();
    }
    studio = null;
    widget = null;
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
        else target?.close();
        break;
      case 'always-on-top': {
        const enabled = value ?? !(target?.isAlwaysOnTop() ?? false);
        target?.setAlwaysOnTop(enabled, 'screen-saver');
        if (target === widget) store.update(mergeSettings(settings(), { widget: { alwaysOnTop: enabled } }));
        tray?.rebuildMenu();
        break;
      }
    }
  };

  const relaunchWindows = () => {
    // The window material can only be set at construction time.
    const showStudio = studio !== null && !studio.isDestroyed();
    const showWidget = widget !== null && !widget.isDestroyed();
    destroyWindows();
    if (showStudio) openView('studio');
    if (showWidget) ensureWidget();
  };

  app.on('second-instance', () => openView('studio'));

  app.whenReady().then(() => {
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

    tray = new NetGaugeTray(settings, {
      openStudio: () => openView('studio'),
      runSpeedTest: () => openView('test'),
      toggleWidget: () => {
        const enabled = !settings().widget.enabled;
        store.update(mergeSettings(settings(), { widget: { enabled } }));
        if (enabled) ensureWidget();
        else widget?.close();
        tray?.rebuildMenu();
      },
      togglePaused: () => setPaused(!settings().monitor.paused),
      setUnit: (unit) => {
        store.update(mergeSettings(settings(), { monitor: { unit } }));
        tray?.rebuildMenu();
      },
      toggleAlwaysOnTop: () => windowAction('always-on-top', !settings().widget.alwaysOnTop, widget ?? undefined),
      toggleLoginItem: () => applyLoginItem(!settings().behaviour.launchAtLogin),
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
    });

    store.onChange((next) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(CHANNELS.settingsChanged, next);
      }
      // Live-apply the settings that do not need a new window.
      if (widget && !widget.isDestroyed()) {
        widget.setAlwaysOnTop(next.widget.alwaysOnTop, 'screen-saver');
        widget.setIgnoreMouseEvents(next.widget.clickThrough, { forward: true });
        const width = Math.round(next.widget.width * next.widget.scale);
        widget.setSize(width, Math.round(230 * next.widget.scale));
      }
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
        store.update(mergeSettings(initial, { behaviour: { launchAtLogin: actual } }));
      }
    }

    if (!initial.monitor.paused) sampler.start();

    const hidden = process.argv.includes('--hidden') || initial.behaviour.startHidden;
    if (!hidden) openView('studio');
    ensureWidget();
  });

  // Closing the window keeps NetGauge alive in the tray — that is the point of it.
  app.on('window-all-closed', () => {
    if (!isWindows && !quitting) return;
  });

  app.on('before-quit', () => {
    quitting = true;
    sampler?.stop();
    tray?.destroy();
  });

  app.on('activate', () => openView('studio'));
}

