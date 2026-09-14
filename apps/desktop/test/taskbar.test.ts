import { describe, expect, it } from 'vitest';
import {
  dockRect,
  estimateStartButton,
  inferLayoutFromWorkArea,
  parseUiaProbe,
  shouldHideForAutoHide,
  type TaskbarLayout,
} from '../src/main/taskbar';
import { DEFAULT_SETTINGS, widgetLayoutOf, widgetMetrics, type NetGaugeSettings } from '../src/shared/bridge';

const display = { x: 0, y: 0, width: 1920, height: 1080 };
const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

function layout(overrides: Partial<TaskbarLayout> = {}): TaskbarLayout {
  return {
    rect: { x: 0, y: 1040, width: 1920, height: 40 },
    edge: 'bottom',
    thickness: 40,
    autoHide: false,
    alignment: 'center',
    startButton: { x: 800, y: 1040, width: 48, height: 40 },
    source: 'uia',
    ...overrides,
  };
}

describe('taskbar geometry detection', () => {
  it('derives a bottom taskbar strip from the work area', () => {
    const result = inferLayoutFromWorkArea(display, workArea);
    expect(result.edge).toBe('bottom');
    expect(result.thickness).toBe(40);
    expect(result.rect).toEqual({ x: 0, y: 1040, width: 1920, height: 40 });
    expect(result.autoHide).toBe(false);
  });

  it('handles a top, left and right taskbar', () => {
    expect(inferLayoutFromWorkArea(display, { x: 0, y: 48, width: 1920, height: 1032 }).edge).toBe('top');
    expect(inferLayoutFromWorkArea(display, { x: 40, y: 0, width: 1880, height: 1080 }).edge).toBe('left');
    expect(inferLayoutFromWorkArea(display, { x: 0, y: 0, width: 1880, height: 1080 }).edge).toBe('right');
  });

  it('flags an auto-hidden taskbar, where the work area equals the display', () => {
    const result = inferLayoutFromWorkArea(display, display);
    expect(result.autoHide).toBe(true);
    expect(result.edge).toBe('bottom');
  });

  it('parses the UI Automation probe output', () => {
    const parsed = parseUiaProbe('TRAY 0 1040 1920 40\nSTART 812 1040 48 40\nALIGN 1\n');
    expect(parsed.tray).toEqual({ x: 0, y: 1040, width: 1920, height: 40 });
    expect(parsed.start).toEqual({ x: 812, y: 1040, width: 48, height: 40 });
    expect(parsed.alignment).toBe('center');
    expect(parseUiaProbe('ALIGN 0').alignment).toBe('left');
  });

  it('ignores junk in the probe output', () => {
    const parsed = parseUiaProbe('TRAY 0 0 0 0\nnot a rect\nSTART a b c d\n');
    expect(parsed.tray).toBeUndefined();
    expect(parsed.start).toBeUndefined();
  });
});

describe('Start button estimation', () => {
  it('puts Start left of centre on a centred taskbar', () => {
    const rect = { x: 0, y: 1040, width: 1920, height: 40 };
    const start = estimateStartButton(rect, 'bottom', 'center');
    expect(start.x).toBeLessThan(rect.width / 2);
    expect(start.x).toBeGreaterThan(rect.width / 2 - 200);
  });

  it('puts Start at the far left for a left-aligned taskbar', () => {
    const rect = { x: 0, y: 1040, width: 1920, height: 40 };
    expect(estimateStartButton(rect, 'bottom', 'left').x).toBe(8);
  });
});

describe('dockRect', () => {
  const input = { width: 300, height: 34, align: 'before-start' as const, offsetX: 0, offsetY: 0, gap: 8 };

  it('parks the widget immediately left of the Start button', () => {
    const rect = dockRect(layout(), input);
    expect(rect.x + rect.width).toBe(800 - 8);
    // Vertically centred inside the strip.
    expect(rect.y).toBe(1040 + 3);
    expect(rect.height).toBe(34);
  });

  it('falls back to the right of Start when there is no room on the left', () => {
    const rect = dockRect(layout({ startButton: { x: 4, y: 1040, width: 48, height: 40 } }), input);
    expect(rect.x).toBe(4 + 48 + 8);
  });

  it('supports the other anchors', () => {
    const after = dockRect(layout(), { ...input, align: 'after-start' });
    expect(after.x).toBe(856);

    const start = dockRect(layout(), { ...input, align: 'start' });
    expect(start.x).toBe(8);

    const centre = dockRect(layout(), { ...input, align: 'center' });
    expect(centre.x).toBe(Math.round((1920 - 300) / 2));

    const tray = dockRect(layout(), { ...input, align: 'tray' });
    expect(tray.x).toBe(1920 - 300 - 8);
  });

  it('applies the manual nudge on top of the anchor', () => {
    const rect = dockRect(layout(), { ...input, offsetX: 40, offsetY: -4 });
    expect(rect.x + rect.width).toBe(800 - 8 + 40);
    expect(rect.y).toBe(1040 + 3 - 4);
  });

  it('never lets the widget run away from the taskbar', () => {
    const rect = dockRect(layout(), { ...input, offsetX: 5000 });
    expect(rect.x).toBeLessThanOrEqual(1920 - 24);
  });

  it('stacks above Start on a vertical taskbar', () => {
    const vertical = layout({
      rect: { x: 0, y: 0, width: 48, height: 1080 },
      edge: 'left',
      thickness: 48,
      startButton: { x: 0, y: 500, width: 48, height: 48 },
    });
    const rect = dockRect(vertical, { ...input, width: 34, height: 300 });
    expect(rect.y + rect.height).toBe(500 - 8);
    expect(rect.x).toBe(7);
  });
});

describe('auto-hide handling', () => {
  const settings: NetGaugeSettings = DEFAULT_SETTINGS;

  it('hides the widget when the taskbar has slid off screen', () => {
    // 40 px strip pushed off the bottom of a 1080 px display: only 10 px remain.
    const hidden = layout({ autoHide: true, rect: { x: 0, y: 1070, width: 1920, height: 40 } });
    expect(shouldHideForAutoHide(hidden, settings, display)).toBe(true);
  });

  it('keeps the widget while the taskbar is visible', () => {
    const visible = layout({ autoHide: true, rect: { x: 0, y: 1040, width: 1920, height: 40 } });
    expect(shouldHideForAutoHide(visible, settings, display)).toBe(false);
  });

  it('ignores auto-hide when the user asked to keep the widget', () => {
    const hidden = layout({ autoHide: true, rect: { x: 0, y: 1070, width: 1920, height: 40 } });
    const keep: NetGaugeSettings = { ...settings, widget: { ...settings.widget, dockAutoHide: 'keep' } };
    expect(shouldHideForAutoHide(hidden, keep, display)).toBe(false);
  });
});

describe('widget metrics', () => {
  it('uses the taskbar strip geometry when docked', () => {
    const settings: NetGaugeSettings = {
      ...DEFAULT_SETTINGS,
      widget: { ...DEFAULT_SETTINGS.widget, dock: 'taskbar', width: 320, dockThickness: 36, scale: 1 },
    };
    expect(widgetLayoutOf(settings)).toBe('taskbar');
    expect(widgetMetrics(settings)).toEqual({ layout: 'taskbar', width: 320, height: 36 });
  });

  it('scales the strip with the widget scale', () => {
    const settings: NetGaugeSettings = {
      ...DEFAULT_SETTINGS,
      widget: { ...DEFAULT_SETTINGS.widget, dock: 'taskbar', width: 300, dockThickness: 34, scale: 1.5 },
    };
    expect(widgetMetrics(settings)).toEqual({ layout: 'taskbar', width: 450, height: 51 });
  });

  it('grows the card when optional rows are switched on', () => {
    const bare: NetGaugeSettings = {
      ...DEFAULT_SETTINGS,
      widget: { ...DEFAULT_SETTINGS.widget, dock: 'floating', showSparkline: false, showPeak: false, showAdapter: false },
    };
    const full: NetGaugeSettings = {
      ...DEFAULT_SETTINGS,
      widget: { ...DEFAULT_SETTINGS.widget, dock: 'floating', showSparkline: true, showPeak: true, showAdapter: true },
    };
    const bareHeight = widgetMetrics(bare).height;
    const fullHeight = widgetMetrics(full).height;
    expect(fullHeight).toBeGreaterThan(bareHeight);
    // The old implementation hard-coded 230 px, which clipped the card at scale 1.
    expect(fullHeight).toBeGreaterThanOrEqual(180);
    expect(bareHeight).toBeGreaterThanOrEqual(120);
  });

  it('defaults to the taskbar strip', () => {
    expect(widgetMetrics(DEFAULT_SETTINGS).layout).toBe('taskbar');
  });
});
