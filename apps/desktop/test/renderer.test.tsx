// @vitest-environment jsdom
/**
 * Mounts the renderer views inside a DOM (no Electron). This is the closest the
 * CI sandbox can get to "running the app": it catches runtime errors in the React
 * tree — bad hooks, undefined components, crashes while rendering live samples.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import App, { previewDockStyle } from '../src/renderer/App';
import Studio from '../src/renderer/views/Studio';
import Widget from '../src/renderer/views/Widget';
import { StoreProvider } from '../src/renderer/lib/store';
import { DEFAULT_SETTINGS, type NetGaugeSettings } from '../src/shared/bridge';

afterEach(cleanup);

describe('renderer mounts without Electron', () => {
  it('renders the Studio with its navigation', async () => {
    render(
      <StoreProvider>
        <Studio />
      </StoreProvider>,
    );
    expect(screen.getByText('NetGauge')).toBeTruthy();
    expect(screen.getByText('Speed test')).toBeTruthy();
    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByText('Browser preview')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText(/Live/).length).toBeGreaterThan(0));
  });

  it('renders the Widget with live numbers', async () => {
    render(
      <StoreProvider>
        <Widget />
      </StoreProvider>,
    );
    // The simulated bridge seeds samples, so a Mbps readout should appear.
    await waitFor(
      () => {
        const text = document.body.textContent ?? '';
        expect(text).toContain('Mbps');
      },
      { timeout: 3000 },
    );
  });

  it('mounts the whole App router', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('NetGauge')).toBeTruthy());
  });
});

/**
 * The two surface rules are explicit product requirements, so they get explicit
 * tests: the Studio window must be opaque, and the taskbar widget must let the
 * taskbar show through it.
 */
describe('surface opacity contract', () => {
  it('applies alpha 1 to the Studio and the configured opacity to the widget', async () => {
    const { applySettings } = await import('../src/renderer/lib/theme');
    const { DEFAULT_SETTINGS } = await import('../src/shared/bridge');
    const settings = { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_SETTINGS.appearance, opacity: 0.62 } };

    document.body.dataset.view = 'studio';
    applySettings(settings);
    expect(document.documentElement.style.getPropertyValue('--ng-surface-alpha')).toBe('1');

    document.body.dataset.view = 'widget';
    applySettings(settings);
    expect(document.documentElement.style.getPropertyValue('--ng-surface-alpha')).toBe('0.62');
  });

  it('declares the opaque default in the stylesheet', () => {
    const css = readFileSync(resolve(process.cwd(), 'apps/desktop/src/renderer/styles.css'), 'utf8');
    expect(css).toContain('--ng-surface-alpha: 1');
    expect(css).toMatch(/\.ng-surface\s*\{[^}]*var\(--ng-surface-alpha\)/s);
    expect(css).toContain("body[data-view='widget']");
  });

  it('renders speed details only, with no Studio navigation', async () => {
    render(
      <StoreProvider>
        <Widget />
      </StoreProvider>,
    );
    await waitFor(() => expect(document.body.textContent).toContain('Mbps'));
    expect(screen.queryByText('Appearance')).toBeNull();
    expect(document.querySelector('.ng-taskbar-strip')).toBeTruthy();
    // Text-only strip: two live readouts and no controls, chips or dividers.
    expect(document.querySelectorAll('.ng-taskbar-metric')).toHaveLength(2);
    expect(document.querySelector('.ng-taskbar-strip button')).toBeNull();
    expect(document.querySelector('.ng-taskbar-strip .ng-chip')).toBeNull();
  });
});

describe('browser-preview docking', () => {
  const base = (): NetGaugeSettings => structuredClone(DEFAULT_SETTINGS);

  it('hangs the widget to the left of Start', () => {
    const style = previewDockStyle(base());
    // 120px is where the Start cluster's outer edge sits; the strip is placed a
    // further `dockGap` to its left.
    expect(style.left).toBe('calc(50% - 120px - 8px - 210px + 0px)');
    expect(style.width).toBe(210);
    expect(style.height).toBe(34);
    expect(style.top).toBe(7); // centred in the 48px taskbar
  });

  it('flips to the right of Start and honours nudges and scale', () => {
    const flipped = base();
    flipped.widget.dockAlign = 'after-start';
    expect(previewDockStyle(flipped).left).toBe('calc(50% + 120px + 8px + 0px)');

    const nudged = base();
    nudged.widget.dockOffsetX = 40;
    nudged.widget.dockGap = 16;
    nudged.widget.scale = 1.5;
    nudged.widget.dockOffsetY = 3;
    const style = previewDockStyle(nudged);
    expect(style.left).toBe('calc(50% - 120px - 16px - 315px + 40px)');
    expect(style.width).toBe(315);
    expect(style.height).toBe(51);
    expect(style.top).toBe(1.5);
  });

  it('mounts the preview taskbar with the widget docked inside it', async () => {
    window.location.hash = '#/widget';
    render(<App />);
    await waitFor(() => expect(document.querySelector('.ng-taskbar-strip')).toBeTruthy());
    const docked = document.querySelector('.pointer-events-auto.absolute') as HTMLElement | null;
    expect(docked).toBeTruthy();
    expect(docked?.getAttribute('data-dock')).toBe('before-start');
    window.location.hash = '';
  });
});
