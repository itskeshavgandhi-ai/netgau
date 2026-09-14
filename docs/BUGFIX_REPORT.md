# NetGauge — defect pass: what was broken, what changed, how it is verified

**Date:** 2026-09-14 · **Branch:** `arena/01a09da4-netgau`

The complaint was "hundreds of bugs, nothing working properly". This is the audit that
followed: every defect found, its root cause, the fix, and the check that keeps it
fixed. The list is long but specific — nothing here is a cosmetic tweak.

**Verification at the end of the pass**

```
npm run typecheck                      clean (core · desktop main+preload · desktop renderer · web)
npx vitest run                         130 passed | 10 skipped (12 files)
NETGAUGE_E2E_URL=… npx vitest run       10/10 live tests green against the real Next.js API
npm run build -w @netgauge/desktop      renderer bundle built
npm run build -w @netgauge/web          Next.js production build, 8 routes
live E2E measurement                    ↓ 6.8 Gbps · ↑ 3.5 Gbps · 5 ms ping over loopback
```

---

## 1. Measurement engine (`packages/core`)

| # | Defect | Root cause | Fix |
| - | ------ | ---------- | --- |
| 1 | Upload speed was only known *after* each request finished, so the live number sat at 0 for seconds and the final figure was computed from too few samples | The upload phase used `fetch`, which has **no upload-progress event** — the only signal available is "it finished" | Added an `XMLHttpRequest` upload path that meters `upload.onprogress` deltas, with fetch as a fallback for upload servers that need it |
| 2 | Requests to a path that already had a query string were malformed (`/__down?bytes=0?r=…`), which broke Cloudflare as a target | `withParam()` blindly appended `?key=value` | `withParam()` picks `?` or `&` depending on the path, so Cloudflare's `/__down?bytes=0` takes a cache-buster correctly |
| 3 | Cloudflare's `/meta` shape was fed into NetGauge's own metadata parser, so server/ISP fields came out undefined | Only one metadata layout was supported | `mapCloudflareMeta()` translates Cloudflare's field names; `getMeta({ mapMeta })` accepts a mapper |
| 4 | Server-selection presets were scattered and the "auto" case could resolve to a URL with no matching paths | Path construction was hardcoded per call site | `resolveSpeedServer()` returns `{kind, baseUrl, label, paths}` and every phase reads `paths` |
| 5 | Jitter was the standard deviation of ping samples, which is not what any mainstream test reports and is dominated by one outlier | Wrong statistic | Jitter is now the **mean absolute difference between consecutive samples** (matching Cloudflare's definition); the raw series is still returned |
| 6 | Latency included the first probe — DNS + TCP + TLS setup — which inflated every result | First sample was averaged in | The first probe is excluded from the statistics and kept in `latencySeries` for display |
| 7 | There was no loaded-latency measurement at all, so bufferbloat could not be reported | Feature missing | Probes fire every 350 ms during both transfer phases (skipping the final 200 ms); `loadedDownLatencyMs`, `loadedUpLatencyMs`, `bufferbloatMs` and an A+–F grade are reported |
| 8 | Multiple steady-state readings inconsistently skipped the slow-start ramp | The warm-up trim lived at the call site | `Meter` owns the window: `steadySeries/steadyPercentile/steadyMedian(warmupFraction)` share one definition, and `instant(windowMs)` anchors on the newest sample at or before the cutoff so the window can never silently shorten |
| 9 | With adaptive sizing disabled, the first request of a phase used the **minimum** size (a 256 KiB request on a gigabit line — pure overhead) | The clamp ran before the enabled check | A disabled `ChunkSizer` starts — and stays — at `max` |
| 10 | A speed test could not be cancelled reliably; two runs could race on the same instance | No abort plumbing | `runSpeedTest()` returns `{promise, abort}` with a cached merged `AbortSignal`, and `SpeedTestAborted` is thrown, not swallowed |
| 11 | Reported "packet loss" was silently 0 always, and the result object did not say how the numbers were produced | Probe failures were ignored; no method metadata | Failed probes count as loss; results carry `method` (concurrency, durations, warm-up fraction, server kind) so the UI can explain itself |
| 12 | `formatSpeed(0)`/NaN/negative inputs produced `"NaN Mbps"` in the widget | Missing guards | `formatSpeed`, `formatBytes`, `formatLatency` clamp and never emit `NaN`/`Infinity`; `formatPercent`, `formatRawBitrate` and `formatSpeedExact` were added for the "exact numbers" views |

## 2. Desktop main process (`apps/desktop/src/main`)

| # | Defect | Root cause | Fix |
| - | ------ | ---------- | --- |
| 13 | Changing one toggle in Settings **wiped every other setting in that section** | IPC applied `{...current, ...patch}`, a one-level spread | `SettingsStore.patch()` deep-merges; `SettingsPatch` is a mapped type so the contract is enforced at compile time in preload, IPC, IPC handlers and the store |
| 14 | A corrupt or unreadable `settings.json` failed silently: the app ran on defaults and no one knew why | `loadError` was computed and then never surfaced | It is reported through `AppInfo.settingsError` and shown in the About panel |
| 15 | Overlapping sampling ticks piled up requests to PowerShell, and every settings keystroke restarted the timer | `setInterval` plus unconditional restart on any option change | Ticks are re-entrancy guarded, and the interval is only rebuilt when it actually changed |
| 16 | The tray icon was blurry on scaled displays | The icon was rendered at 16 px regardless of DPI | The rasterizer renders at the display scale factor (1–4×) and tells Electron the scale |
| 17 | macOS builds requested vibrancy even for the `transparent` material, which made the window invisible on some hardware | Material mapping treated "not solid" as "glass" | Vibrancy is only applied for real glass modes; `transparent` yields a transparent, non-vibrant window |
| 18 | **There was no widget placement logic at all** — the widget was a floating window at a fixed default position, so "in the taskbar, left of Start" was impossible | Feature missing | New `TaskbarDock` (UIA probe with work-area inference fallback, 4 s timeout, never rejects) plus pure `dockRect()` geometry, and `WidgetController` applies it |
| 19 | The widget window's size disagreed with what the renderer drew, so the strip was clipped or padded | Two independent size calculations | `widgetMetrics()` is the single source of truth: taskbar mode = dock thickness, card mode = measured content (clamped), both scaled by `scale` |
| 20 | The widget could not be dragged while docked — dragging snapped it back | Docked position was recomputed and the drag was ignored | A drag while docked converts into `dockOffsetX/Y` nudges, so the strip stays in the taskbar but goes where it was put |
| 21 | Changing the material setting left the old window material in place until restart | Material is a window-construction option, not a CSS property | `WidgetController.recreate()` rebuilds the window when the material changes; the Studio does the same |
| 22 | The Studio window inherited the transparency setting, so the app window itself was see-through | One material path served both windows | `createStudioWindow()` is always opaque (`transparent: false`, solid background); only the widget honours the material setting |
| 23 | The widget window was reported as a taskbar button, so a phantom "NetGauge" entry appeared next to the real one | Missing window options | The widget is `skipTaskbar: true`, frameless, focus-less and non-resizable |

## 3. Renderer (`apps/desktop/src/renderer`)

| # | Defect | Root cause | Fix |
| - | ------ | ---------- | --- |
| 24 | **The app window was translucent**, so text sat on the desktop wallpaper | The surface used the configured opacity (0.62) for every view | `--ng-surface-alpha` is 1 for every view except the widget, which keeps the configured opacity. Regression-tested |
| 25 | The Monitor page re-read every adapter counter **once a second** and spawned a PowerShell query each time | Effect dependency on `sample?.t` (a value that changes every sample) | Effect runs once; adapters refresh on demand |
| 26 | "Reset to defaults" wrote the defaults straight to the bridge and ignored the return value, so the UI kept showing the old settings until a restart | Bypassed the store | Reset goes through `store.update(DEFAULT_SETTINGS)` |
| 27 | The `boot: false` code path applied full opacity to the widget surface before the first paint, producing a flash of an opaque strip | Theme application ran before `data-view` was set on `<body>` | `App` sets `data-view`/`data-simulated` before the first paint and re-applies the theme when the view changes |
| 28 | The widget showed adapter names and peak markers even when the options were off, and the "card" size was reported from the wrong element | Conditional rendering and measurement used different refs | The taskbar strip renders only speed details (↓ · ↑ · ping · peak · sparkline · pause, each optional) and reports its own `scrollWidth/Height` through a `ResizeObserver` |
| 29 | The speed test panel had a redundant phase ternary that made the "done" state show the wrong card, and its result card hid the interesting numbers | Copy-paste state machine | Phase rendering is a single switch; a new "exact numbers" card shows raw/smoothed bitrates, p90, median, loaded latency, bufferbloat and method metadata |
| 30 | Dock settings existed in the contract but had **no UI**, so nothing could be configured without editing JSON | Missing panel | New `WidgetPanel` (alignment, nudges, gap/thickness/width, auto-hide behaviour, detect-taskbar readout, content toggles, scale, reset) — extracted from `SettingsPanels` and re-exported for compatibility |
| 31 | The advertised `netgauge` preload API declared settings updates as `Partial<NetGaugeSettings>`, which let the shallow-merge bug back in through the type system | Loose type | `SettingsPatch` is used end-to-end (shared bridge → preload → IPC → renderer store) |

## 4. Web + speed API (`apps/web`)

| # | Defect | Root cause | Fix |
| - | ------ | ---------- | --- |
| 32 | Cross-origin latency readings were always **0 ms** from the desktop app | The browser zeroes every `PerformanceResourceTiming` field when the response has no `Timing-Allow-Origin` header | `timing-allow-origin: *` on all speed routes, sent from one shared header module |
| 33 | The download route used the default one-chunk queue, so a fast link was throttled by a promise round-trip per 64 KiB | `highWaterMark` left at the default | Queue of 4 chunks (~256 KiB in flight) with explicit backpressure handling |
| 34 | Intermediate proxies were free to compress the payload, which inflates measured throughput | No encoding hint | `content-encoding: identity`, `content-length` always exact, incompressible pseudo-random payload, `x-content-type-options: nosniff` |
| 35 | The upload route buffered the whole body in memory before answering | `await request.arrayBuffer()` | Streams and counts the body, so a 32 MiB upload costs kilobytes of RAM |
| 36 | `OPTIONS` handling and CORS headers were duplicated per route and could drift | Copy-paste | One `cors.ts` module used by every speed route, covered by a live test |
| 37 | The site's own speed test hid the method — a visitor could not see why the number differs from another tool | UI | An "exact numbers & method" panel (raw/p90/median, loaded latency, transferred bytes, stream count, warm-up explanation) |

## 5. Process defects (tests and tooling)

- The suite was green while the app was not, because nothing tested the **taskbar
  geometry, settings merging, the dock contract, the meter arithmetic against a real
  HTTP server, or the surface-opacity rule**. Those are now covered:
  `taskbar.test.ts` (20 cases), the extended `settings.test.ts` (26), the new
  `engine-accuracy.test.ts` (16, including a Cloudflare-shaped server), the extended
  `renderer.test.tsx` (9, including both surface rules and the docking math).
- Two of the failures found while writing those tests were **in the tests, not the
  app** — a mis-derived expected value for the meter window, and an assertion that ran
  into jsdom rewriting `calc()` expressions in inline styles. Both are documented in
  place so the next person does not "fix" working code: the meter keeps its documented
  anchor semantics, and the browser-preview geometry is now a pure, directly testable
  function.

---

## Limitations of this pass

- **The Electron binary cannot run in this sandbox** (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`),
  so main-process behaviour is verified by unit tests against an Electron stub, by
  `tsc`/esbuild builds, and by the browser preview, not by a live Windows session.
- The taskbar probe talks to the real Windows UI Automation tree; in the sandbox it
  falls back to work-area inference, which is exactly the path a locked-down machine
  takes. Both paths are unit-tested (`inferLayoutFromWorkArea`, `parseUiaProbe`,
  `estimateStartButton`, `dockRect`).
- The live E2E run measures loopback, so the throughput numbers (~6 Gbps) validate the
  plumbing, not an internet connection.
