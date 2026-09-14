# NetGauge — Architecture

Monorepo (npm workspaces): `packages/core`, `apps/web`, `apps/desktop`.

```
              ┌──────────────────────────── packages/core ────────────────────────────┐
              │ SpeedTester (fetch-based) · stats · iface parsers · tray rasterizer │
              └───────────────▲───────────────────────────────────▲───────────────────┘
                              │                                   │
        ┌─────────────────────┴──────────────┐   ┌────────────────┴─────────────────┐
        │            apps/web                │   │          apps/desktop            │
        │  Next.js site + /api/speed/*       │◄──┤  Electron main/preload/renderer  │
        │  (download/upload/ping/meta)       │   │  (measures against any server)   │
        └────────────────────────────────────┘   └──────────────────────────────────┘
```

## packages/core (the single source of truth)

- **`speedtest/engine.ts`** — `SpeedTester`. Phases: latency (best-of-N), download and upload
  (N parallel streams walking a 1→32 MiB chunk ramp). A shared `Meter` accumulates bytes with
  timestamps; the result is the **steady-state** rate (first 20% discarded as TCP slow-start).
  Only needs `fetch`, so it runs in a browser, in Node, and in the Electron renderer unchanged.
- **`iface.ts`** — pure parsers for per-OS byte counters (`/proc/net/dev`, PowerShell
  `Get-NetAdapterStatistics` TSV, `netstat -ib`, `netstat -e`) and `diffCounters` → bits/s,
  dropping counter resets.
- **`stats.ts` / `format.ts`** — percentile/jitter/EMA/ring-buffer; unit scaling (auto or pinned).
- **`tray.ts`** — a tiny RGBA rasterizer that draws the tray icon (signal bars or sparkline)
  from the current sample, in the user's accent colour.

## apps/web

- **Speed API** (`app/api/speed/*`): `ping` (13 B), `download?bytes=N` (streams exactly N
  incompressible bytes, backpressure-respecting), `upload` (drains body, echoes count),
  `meta` (server + best-effort client geo). All CORS-enabled so the desktop app can measure
  cross-origin. `next.config.ts` sets `compress: false` so gzip never inflates the measurement.
- **Site**: home = gauge + GO + result cards + history (localStorage) + features/FAQ/CTA;
  `/download` = platform-detect cards fed by `/api/releases` (GitHub, with fallback).
- Self-hosted variable fonts via `@fontsource*` (no CDN, offline-safe).

## apps/desktop

- **Main**: `Sampler` polls a platform `CounterReader` (a *persistent* PowerShell process on
  Windows to avoid per-tick spawn cost; `/proc/net/dev` on Linux), diffs, smooths (EMA) and
  broadcasts `LiveSample`s. `NetGaugeTray` re-renders its icon from samples and rebuilds its menu
  from settings. `windows.ts` maps the glass setting to the right OS material
  (`materialFor`), and `settings.ts` persists/sanitises everything.
- **Preload** exposes a typed `window.netgauge` bridge (context-isolated).
- **Renderer** (React + Vite + Tailwind): `#/studio` (Live, Speed test, Appearance, Widget,
  Monitor, Behaviour, About) and `#/widget` (compact overlay). All visuals are CSS custom
  properties driven by `applySettings`, so customisation is instant and the browser does the work.
  When run outside Electron (browser preview) a `SimulatedBridge` supplies a synthetic feed and
  the speed test still works against a proxied `/api`.

## Data flow (tray)

`CounterReader.read()` → `Sampler.tick()` (diff + EMA) → `LiveSample` →
tray icon/tooltip + every window (`webContents.send`) → renderer hooks update UI.

## Why one engine?

The website and the tray show the *same* numbers because they call the same `SpeedTester` and the
same formatting/stats code. Bugs fixed in one place are fixed everywhere, and the E2E tests run
the web API through the core engine.
