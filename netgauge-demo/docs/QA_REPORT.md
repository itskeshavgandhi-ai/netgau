# NetGauge — QA Report

**Date:** 2026-09-13 · **Branch:** `arena/01a09bbf-netgauge-demo` · **Tester:** automated QA pass (unit, integration, build, typecheck, runtime)

This report records what was executed, what it returned, and the defects that QA surfaced and fixed before sign-off.

> Verdict: **PASS** — 90/90 automated tests green, all typechecks and builds clean, live web + app previews verified over HTTP. One environment-limited item is noted under *Limitations*.

---

## 1. Scope

| Surface | What it is | How it was verified |
| --- | --- | --- |
| `packages/core` | Shared speed-test engine, throughput math, counter parsers, tray rasterizer | Vitest unit + a real HTTP server end-to-end |
| `apps/web` | Next.js 16 speed-test site + speed API + downloads page | `next build`, `tsc`, live route checks over HTTP, E2E engine run |
| `apps/desktop` (main/preload) | Electron tray app: sampler, tray icon, windows, IPC, settings | `tsc`, esbuild bundle, Vitest with an Electron stub |
| `apps/desktop` (renderer) | React UI: Studio, Widget, customisation | `tsc`, Vite build, jsdom mount tests, live Vite preview over HTTP |
| Icons | `.ico` / `.png` generated from one SVG | ICO header parse + visual inspection |
| CORS | Desktop app measuring cross-origin | Live `OPTIONS`/`POST` checks |

---

## 2. Automated test matrix

Run with `NETGAUGE_E2E_URL=http://127.0.0.1:3000 npx vitest run`:

```
Test Files  10 passed (10)
     Tests  90 passed (90)
```

Breakdown by file (all green):

| File | Area | Key assertions |
| --- | --- | --- |
| `packages/core/test/format.test.ts` | Formatting | auto/pinned unit scaling, byte mode, NaN/negative guards |
| `packages/core/test/stats.test.ts` | Stats | percentile, jitter, EMA, ring buffer, steady-state (slow-start excluded) |
| `packages/core/test/iface.test.ts` | Counter parsers | `/proc/net/dev`, PowerShell CSV, `netstat -ib`, `netstat -e`, reset handling, adapter filtering |
| `packages/core/test/tray.test.ts` | Tray rasterizer | size/DPI, transparent corners, accent pixels, bar fill, sparkline, paused dim, tooltip |
| `packages/core/test/speedtest.test.ts` | Engine | full latency→down→up against a **live in-test HTTP server**, parallel streams, abort, HTTP-500 surfacing, unreachable host |
| `apps/web/test/live-endpoints.test.ts` | Web API E2E | real Next.js `/api/speed/*`: full run, exact byte sizes, 1 GB cap, upload echo, meta |
| `apps/web/test/cors.test.ts` | CORS | preflight 204 + wildcard on upload/download |
| `apps/desktop/test/settings.test.ts` | Settings | persistence round-trip, corrupt recovery, clamping, enums, colours, fonts, merge |
| `apps/desktop/test/sampler.test.ts` | Sampler + windows | zero-then-rate, elapsed-time scaling, EMA, adapter filter, reset drop, re-entrancy, PowerShell block parsing, per-OS material mapping |
| `apps/desktop/test/renderer.test.tsx` | Renderer (jsdom) | Studio, Widget and full App mount and render live samples |

Measured live result from the E2E run (loopback, so values are host-limited):
`down 4806.9 Mbps · up 2822.3 Mbps · ping 6.0 ms · jitter 0.8 ms`.

---

## 3. Build & typecheck

| Check | Command | Result |
| --- | --- | --- |
| Core + web + desktop types | `npx tsc --noEmit` (4 tsconfigs) | PASS |
| Web production build | `next build` (Next 16.3.5, Turbopack) | PASS — 6 static + 4 dynamic routes |
| Desktop main/preload bundle | `node scripts/build-main.mjs` | PASS — main 42.7 kB, preload 1.8 kB |
| Desktop renderer bundle | `vite build` (Vite 6.4.3) | PASS — 273.5 kB JS (84.2 kB gzip), 52.7 kB CSS |
| Icon generation | `node scripts/make-icons.mjs` | PASS — 7-size PNG-in-ICO (16–256), 512 PNG |

---

## 4. Runtime / HTTP checks

Web (`next start`, port 3000):

```
GET /                    -> 200 (58 354 B)
GET /download            -> 200 (26 086 B)
GET /robots.txt          -> 200
GET /favicon.svg         -> 200
GET /api/speed/ping      -> 200 (13 B)
GET download?bytes=8388608 -> 200 (exactly 8 388 608 B, ~396 MB/s)
POST upload (2 097 152 B)  -> 200 (received == sent)
GET /api/speed/meta      -> 200 (graceful when ISP lookup unavailable)
GET /api/releases        -> 200 (fallback asset list without GitHub access)
OPTIONS /api/speed/upload -> 204 + access-control-allow-origin: *
```

App preview (Vite 6, port 5173, browser mode of the Electron renderer):

```
preview-host / -> 200   (sandbox host allow-list fixed)
main/App/Studio/Widget/SpeedTestPanel transforms -> 200
proxy /api/speed/ping -> 200   (in-browser speed test wired to the web API)
```

The renderer also mounts under jsdom (`renderer.test.tsx`), which is the closest headless equivalent of launching the app: Studio shows its nav, the Widget renders live `Mbps` numbers, and the App router boots.

---

## 5. Defects found & fixed during QA

| # | Defect | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `runSpeedTest` returned unbound `tester.abort` | `this.controller` undefined → crash on abort | returned a bound closure |
| 2 | Tray downscale divided premultiplied colour by raw alpha | accent pixels rendered ~1/255 | un-premultiply by mean alpha |
| 3 | Sampler used `previousAt > 0` as the "have I sampled" sentinel | broke for any clock starting at 0 (and is a latent prod bug) | explicit `hasPrevious` flag |
| 4 | `formatSpeedPadded` padded the whole string, not the number | tooltip alignment no-op | removed the helper (unused) |
| 5 | `DownloadPanel` read `release.tag` after optional chaining | TS null-error, build failed | uniform optional chaining |
| 6 | Vite 7 + `@vitejs/plugin-react` mismatch in dev | `Missing field 'moduleType'` (react-refresh) 500s | pinned Vite 6.4.3 + plugin-react 4.5.2 |
| 7 | `make-icons.mjs` had TS annotations + wrong base URL | script crashed | plain JS + URL base fix |
| 8 | About "Reset to defaults" sent `{version:1}` (a no-op patch) | reset did nothing | sends `DEFAULT_SETTINGS` |

---

## 6. Limitations (environment)

- **Electron binary / Windows installer cannot be produced here.** GitHub release downloads (`objects.githubusercontent.com`) are egress-blocked in this sandbox, so `electron` is installed with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` and `electron-builder --win` was not executed. The tray/sampler/windows logic is covered by unit tests and a jsdom mount; a real Windows run remains to be done on a machine with network access (`npm run dist:win`).
- **ISP/geo lookup** (`ipwho.is`) is unreachable here; the `/api/speed/meta` route degrades gracefully and is asserted to do so.

---

## 7. Reproduce

```bash
npm install                                  # on a normal machine (downloads Electron)
npm test                                     # unit + integration (hermetic)
npm run start:web &                          # serves :3000
NETGAUGE_E2E_URL=http://127.0.0.1:3000 npm test   # + live API E2E
npm run dev:app                              # Electron app (needs display + network)
```
