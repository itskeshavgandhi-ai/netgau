/**
 * Tiny RGBA rasterizer used to draw the live tray icon.
 *
 * Electron's tray needs a `nativeImage`; rather than shipping a folder of PNGs and
 * hoping one matches the user's accent colour, we render the icon per sample:
 * signal bars that fill with current throughput, or a sparkline of recent history.
 * Pure function in, pixel buffer out — fully unit-testable.
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, top-left origin. */
  data: Uint8Array;
}

export interface TrayIconOptions {
  /** Logical size in device-independent pixels (Windows tray = 16). */
  size?: number;
  /** Supersampling factor; the result is downscaled for crisp edges. */
  scale?: number;
  accent?: [number, number, number];
  /** 0..1 fill level (throughput relative to the user's expected line speed). */
  level?: number;
  mode?: 'bars' | 'sparkline' | 'paused';
  /** Recent 0..1 levels, newest last. Used by `sparkline`. */
  history?: number[];
  /** Dim everything (monitoring paused / offline). */
  dim?: boolean;
}

const TRANSPARENT: [number, number, number, number] = [0, 0, 0, 0];

export function renderTrayIcon(options: TrayIconOptions = {}): RgbaImage {
  const size = Math.max(8, Math.round(options.size ?? 16));
  const scale = Math.max(1, Math.round(options.scale ?? 2));
  const w = size * scale;
  const data = new Uint8Array(w * w * 4);
  const ctx: Canvas = { width: w, height: w, data };

  const accent = options.accent ?? [56, 189, 248];
  const dim = options.dim ?? false;
  const level = clamp01(options.level ?? 0);
  const mode = options.mode ?? 'bars';

  if (mode === 'paused') {
    drawBars(ctx, [0.15, 0.15, 0.15, 0.15], dim ? [120, 120, 120] : accent, 0.35);
    return downscale(ctx, size, [140, 140, 140]);
  }

  if (mode === 'sparkline') {
    drawSparkline(ctx, options.history ?? [], dim ? [150, 150, 150] : accent);
    return downscale(ctx, size);
  }

  const bars = levelToBars(level);
  drawBars(ctx, bars, dim ? [150, 150, 150] : accent, 1);
  return downscale(ctx, size);
}

type Canvas = { width: number; height: number; data: Uint8Array };

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function setPixel(ctx: Canvas, x: number, y: number, color: [number, number, number, number]): void {
  if (x < 0 || y < 0 || x >= ctx.width || y >= ctx.height) return;
  const i = (Math.floor(y) * ctx.width + Math.floor(x)) * 4;
  const [r, g, b, a] = color;
  // Alpha-composite over what is already there so overlapping strokes blend.
  const sa = a / 255;
  const da = ctx.data[i + 3] ?? 0;
  const outA = sa + (da / 255) * (1 - sa);
  ctx.data[i] = outA === 0 ? 0 : Math.round(((r * sa) + ((ctx.data[i] ?? 0) * (da / 255)) * (1 - sa)) / outA);
  ctx.data[i + 1] = outA === 0 ? 0 : Math.round(((g * sa) + ((ctx.data[i + 1] ?? 0) * (da / 255)) * (1 - sa)) / outA);
  ctx.data[i + 2] = outA === 0 ? 0 : Math.round(((b * sa) + ((ctx.data[i + 2] ?? 0) * (da / 255)) * (1 - sa)) / outA);
  ctx.data[i + 3] = Math.round(outA * 255);
}

function fillRect(
  ctx: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number, number],
): void {
  for (let py = Math.floor(y); py < Math.floor(y + h); py += 1) {
    for (let px = Math.floor(x); px < Math.floor(x + w); px += 1) {
      setPixel(ctx, px, py, color);
    }
  }
}

function levelToBars(level: number): [number, number, number, number] {
  // Four ascending bars, like a signal-strength icon.
  const heights: [number, number, number, number] = [0.3, 0.53, 0.76, 1];
  return heights.map((h) => (level >= h - 0.12 ? 1 : 0.22)) as [number, number, number, number];
}

function drawBars(
  ctx: Canvas,
  bars: [number, number, number, number],
  rgb: [number, number, number],
  globalAlpha: number,
): void {
  const s = ctx.width;
  const pad = Math.max(1, Math.round(s * 0.06));
  const gap = Math.max(1, Math.round(s * 0.09));
  const barW = (s - pad * 2 - gap * (bars.length - 1)) / bars.length;
  const bottom = s - pad;

  bars.forEach((alpha, i) => {
    const h = Math.max(1, Math.round((s - pad * 2) * bars[i]!));
    const x = pad + i * (barW + gap);
    const color: [number, number, number, number] = [rgb[0], rgb[1], rgb[2], Math.round(255 * alpha * globalAlpha)];
    fillRect(ctx, x, bottom - h, barW, h, color);
  });
  void TRANSPARENT;
}

function drawSparkline(ctx: Canvas, history: number[], rgb: [number, number, number]): void {
  const s = ctx.width;
  const pad = Math.max(1, Math.round(s * 0.09));
  const points = history.slice(-Math.max(8, Math.floor(s / 1.5)));
  if (points.length < 2) {
    fillRect(ctx, pad, s / 2 - 1, s - pad * 2, 2, [rgb[0], rgb[1], rgb[2], 255]);
    return;
  }
  const stepX = (s - pad * 2) / (points.length - 1);
  const y = (v: number) => s - pad - clamp01(v) * (s - pad * 2);
  const thickness = Math.max(1, Math.round(s * 0.09));

  for (let i = 1; i < points.length; i += 1) {
    const x0 = pad + (i - 1) * stepX;
    const x1 = pad + i * stepX;
    const y0 = y(points[i - 1] ?? 0);
    const y1 = y(points[i] ?? 0);
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let k = 0; k <= steps; k += 1) {
      const t = steps === 0 ? 0 : k / steps;
      fillRect(ctx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thickness, thickness, [rgb[0], rgb[1], rgb[2], 255]);
    }
  }
}

/** Box-filter downscale from the supersampled canvas, with an optional dim pass. */
function downscale(ctx: Canvas, size: number, tint?: [number, number, number]): RgbaImage {
  const factor = ctx.width / size;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const i = ((y * factor + sy) * ctx.width + (x * factor + sx)) * 4;
          const sa = (ctx.data[i + 3] ?? 0) / 255;
          r += (ctx.data[i] ?? 0) * sa;
          g += (ctx.data[i + 1] ?? 0) * sa;
          b += (ctx.data[i + 2] ?? 0) * sa;
          a += ctx.data[i + 3] ?? 0;
          n += 1;
        }
      }
      const o = (y * size + x) * 4;
      // `r`, `g`, `b` are premultiplied sums; divide by the mean alpha to un-premultiply.
      const alpha = a / n;
      const na = alpha / 255;
      data[o] = tint ? tint[0] : na === 0 ? 0 : Math.round(r / n / na);
      data[o + 1] = tint ? tint[1] : na === 0 ? 0 : Math.round(g / n / na);
      data[o + 2] = tint ? tint[2] : na === 0 ? 0 : Math.round(b / n / na);
      data[o + 3] = Math.round(alpha);
    }
  }
  return { width: size, height: size, data };
}

/** Convenience: the tooltip string shown when hovering the tray icon. */
export function trayTooltip(opts: { down: string; up: string; iface?: string; paused?: boolean }): string {
  if (opts.paused) return 'NetGauge — monitoring paused';
  const iface = opts.iface ? ` · ${opts.iface}` : '';
  return `NetGauge · ↓ ${opts.down} · ↑ ${opts.up}${iface}`;
}
