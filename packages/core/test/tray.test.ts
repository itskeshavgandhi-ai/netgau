import { describe, expect, it } from 'vitest';
import { renderTrayIcon, trayTooltip } from '@netgauge/core';

const at = (img: { width: number; data: Uint8Array }, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i] ?? 0, g: img.data[i + 1] ?? 0, b: img.data[i + 2] ?? 0, a: img.data[i + 3] ?? 0 };
};

const opaquePixels = (img: { width: number; height: number; data: Uint8Array }) => {
  let n = 0;
  for (let p = 3; p < img.data.length; p += 4) if ((img.data[p] ?? 0) > 8) n += 1;
  return n;
};

describe('tray icon rasterizer', () => {
  it('produces a square RGBA buffer of the requested size', () => {
    const img = renderTrayIcon({ size: 16, level: 0.5 });
    expect(img.width).toBe(16);
    expect(img.height).toBe(16);
    expect(img.data.length).toBe(16 * 16 * 4);
  });

  it('scales up when the display DPI asks for it', () => {
    const img = renderTrayIcon({ size: 32, level: 1 });
    expect(img.data.length).toBe(32 * 32 * 4);
  });

  it('leaves the corners transparent so the icon sits on any tray theme', () => {
    const img = renderTrayIcon({ size: 16, level: 1, accent: [255, 0, 0] });
    expect(at(img, 0, 0).a).toBe(0);
    expect(at(img, 15, 0).a).toBe(0);
    expect(at(img, 0, 15).a).toBe(0);
  });

  it('paints the accent colour where bars are drawn', () => {
    const img = renderTrayIcon({ size: 16, level: 1, accent: [255, 0, 128] });
    let found = false;
    for (let y = 0; y < 16 && !found; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const px = at(img, x, y);
        if (px.a > 200 && px.r > 200 && px.b > 80 && px.g < 80) {
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('fills more bars as throughput rises', () => {
    const idle = opaquePixels(renderTrayIcon({ size: 16, level: 0 }));
    const busy = opaquePixels(renderTrayIcon({ size: 16, level: 1 }));
    expect(busy).toBeGreaterThan(idle);
  });

  it('draws a sparkline from recent history', () => {
    const img = renderTrayIcon({
      size: 16,
      mode: 'sparkline',
      history: [0.1, 0.4, 0.2, 0.9, 0.6, 0.3, 0.8, 0.5],
      accent: [80, 250, 123],
    });
    expect(opaquePixels(img)).toBeGreaterThan(0);
    // The line should reach near the top where history peaked.
    const topRowHasInk = Array.from({ length: 16 }, (_, x) => at(img, x, 3).a).some((a) => a > 100);
    expect(topRowHasInk).toBe(true);
  });

  it('renders a dimmed icon while paused', () => {
    const paused = renderTrayIcon({ size: 16, mode: 'paused' });
    const running = renderTrayIcon({ size: 16, level: 1, accent: [80, 250, 123] });
    const meanAlpha = (img: typeof paused) => {
      let sum = 0;
      for (let p = 3; p < img.data.length; p += 4) sum += img.data[p] ?? 0;
      return sum / (img.data.length / 4);
    };
    expect(meanAlpha(paused)).toBeLessThan(meanAlpha(running));
  });

  it('builds the hover tooltip', () => {
    expect(trayTooltip({ down: '42.7 Mbps', up: '3.1 Mbps' })).toBe('NetGauge · ↓ 42.7 Mbps · ↑ 3.1 Mbps');
    expect(trayTooltip({ down: '42.7 Mbps', up: '3.1 Mbps', iface: 'Wi-Fi' })).toContain('Wi-Fi');
    expect(trayTooltip({ down: '0', up: '0', paused: true })).toBe('NetGauge — monitoring paused');
  });
});
