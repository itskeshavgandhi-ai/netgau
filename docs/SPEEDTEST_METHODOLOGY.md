# How an internet speed test actually works — and where NetGauge's numbers come from

This document is the research behind NetGauge's measurement engine. It explains what
every phase does, the exact arithmetic behind the numbers, what the public tests
(Ookla, Cloudflare, fast.com, M-Lab) do differently, and which limits make a "speed"
number approximate no matter who measures it. It ends with a map from every claim
here to the code that implements it.

Everything below is written so you can reproduce the numbers yourself: every figure
NetGauge displays can be recomputed from the raw counters it reports.

---

## 1. What a speed test is actually measuring

A speed test is a **timed bulk data transfer to a specific server**. Nothing more.
It answers "how many bits per second moved between this device and that server just
now", and every other question (will Netflix buffer? is my ISP throttling me?) is a
different measurement that this one only approximates.

Three consequences follow, and they explain almost every confusing result people see:

1. **The server matters more than anything else.** A test measures the path to *that*
   server. Ookla selects the lowest-latency server out of ~10 nearby candidates
   because it is trying to measure your access line, not the internet ([1], [2]).
2. **The number is a rate over a window, so the window boundaries change it.** A
   10-second window that includes the TCP ramp-up reports a lower number than a
   10-second window that starts after it.
3. **It is throughput, not goodput.** Protocol headers count as transferred bits.
   A perfectly saturated 1 Gbps Ethernet link tops out near 949 Mbps of *payload*
   once Ethernet framing (38 B/frame incl. preamble + inter-frame gap), IPv4 (20 B)
   and TCP (20 B) headers are removed from a 1500-byte frame — 1460 payload bytes out
   of 1538 bytes on the wire ([3]).

## 2. The phases, in order

Every mainstream test runs the same five stages. Cloudflare documents the timing
model in its open-source engine ([4], [5]); Ookla's is described in its support
documentation and in the independent measurement literature ([1], [6]).

| # | Phase | What happens | Typical cost |
| - | - | - | - |
| 1 | **Server choice** | Ping a candidate list, keep the lowest-latency server | 0.2–1.5 s |
| 2 | **Idle latency (ping + jitter)** | N tiny request/response round trips on a quiet link | ~1 s |
| 3 | **Download** | `N` parallel streams pull bulk data; bytes are counted as they arrive | 8–12 s |
| 4 | **Upload** | `N` parallel streams POST bulk data; bytes are counted as they leave | 8–12 s |
| 5 | **Loaded latency** *(optional)* | Latency probes fired *while* phases 3–4 saturate the link | runs inside 3–4 |

### 2.1 Latency

Latency is the round-trip time (RTT) of the smallest possible exchange. Cloudflare
measures it as **time-to-first-byte** of a `bytes=0` request, using the browser's
`PerformanceResourceTiming` ([4], [7]); Ookla reports the **lowest** value of a
repeated probe ([5]); NetGauge's engine times a request/response pair itself.

Rules that matter:

- **Discard the first probe.** It pays for DNS, TCP and TLS setup. Cloudflare's
  default measurement list does exactly this: one probe for estimation, then 20 for
  the real number ([4]).
- **Best-of is not the same as median.** Best-of-N reports the *floor* of your path;
  the median reports the typical case. Cloudflare's default `latencyPercentile` is
  `0.5` — the median ([4]). NetGauge reports **both**: `latencyMs` (best of N, the
  Ookla-style headline) and `medianLatencyMs`.
- **Jitter is not standardised.** Cloudflare defines it as the *average absolute
  difference between consecutive ping samples* ([7]); Waveform/BufferSpeed report a
  p95−median spread instead ([8]). NetGauge uses the mean absolute difference
  (RFC 6349-flavoured, matching Cloudflare) and reports the raw sample series so you
  can compute any other statistic yourself.
- **Loss** is measured as the fraction of probes that never came back. Real packet
  loss needs UDP/TURN probes (Cloudflare's `packetLoss` measurement, [4]); an HTTP
  probe can only report "request failed".

### 2.2 Download and upload: why there are several streams

A single TCP connection cannot fill a fast, high-latency link. Two mechanisms limit it:

- **TCP slow start.** The congestion window starts small and doubles per RTT until
  loss or the receiver window stops it. On a 20 ms path, reaching a 4 MB window takes
  ~9 RTTs ≈ 0.2 s — but for a short test the ramp is a large fraction of the window.
- **Bandwidth-delay product.** The window needed to fill a link is
  `bandwidth × RTT`. A 1 Gbps link at 20 ms needs ~20 Mb ≈ 2.5 MB in flight, which
  single stream window scaling often does not reach in the first second.

The industry answer is parallel connections: Ookla opens **4–16 adaptive streams**
([9], [10]); Cloudflare runs several concurrent request sets and increases file size
until a request lasts long enough to be meaningful (`bandwidthFinishRequestDuration`
defaults to 1000 ms, `bandwidthMinRequestDuration` to 10 ms) ([4]).

> The "1 Gbps fibre shows 400–600 Mbps on one stream, 950+ Mbps on eight" claim is
> repeated across measurement guides and matches what the congestion-control maths
> above predicts ([9]).

NetGauge defaults to **6 streams**, tunable 1–16.

### 2.3 Adaptive request sizes

Rather than a fixed chunk size, both Ookla and Cloudflare grow the transferred size
until the request lasts about a second ([4], [5]). This matters for three reasons: a
request that is too short is dominated by HTTP and TLS overhead; a request that is
too long starves the live readout and (for uploads) hides progress entirely; and a
fixed size is wrong for *someone* — 1 MiB is a 100 ms request on a gigabit line and a
10 s request on a 1 Mbps line.

NetGauge implements the same rule in `ChunkSizer`: start at 256 KiB, double when the
request finished in under 60% of the ~1 s target, halve when it overshoots 160%,
clamped to 256 KiB – 32 MiB.

## 3. The arithmetic, exactly

### 3.1 Bytes to bits

```
throughput (bit/s) = transferred_bytes × 8 / elapsed_seconds
throughput (Mbit/s) = transferred_bytes × 8 / elapsed_seconds / 1 000 000
```

Network rates use **decimal** prefixes (1 Mbps = 1,000,000 bit/s), file sizes use
**binary** ones (1 MiB = 1,048,576 B). NetGauge keeps that split: `formatSpeed`
scales by 1e3/1e6/1e9, `formatBytes` scales by 1024. Getting this wrong is the single
most common source of "my speed test lies" confusion — 95 Mbps ≈ 11.9 MB/s, and a
download manager showing "12 MB/s" is *not* a discrepancy.

Worked example: a 32 MiB download completes in 3.20 s.

```
32 MiB = 33,554,432 bytes
33,554,432 × 8 = 268,435,456 bit
268,435,456 / 3.20 = 83,886,080 bit/s = 83.9 Mbps
```

### 3.2 Steady state: where the window starts

NetGauge samples the cumulative byte counter roughly every 40 ms. For each phase it
then:

1. Drops the first **20%** of the phase window (TCP slow start), configurable via
   `warmupFraction`.
2. Reports **total bytes ÷ elapsed time over the remaining window** — the same
   quantity a file download would deliver.
3. Additionally reports the **90th percentile** of the per-sample rates in that same
   window, and the **median** sample rate.

Why percentiles at all? Because a mean is dragged around by the ramp and by single
spikes. Cloudflare's published number is literally the **90th percentile** of the
per-request bandwidth measurements (`bandwidthPercentile: 0.9`, and their FAQ says
"taking the 90th percentile speed") ([4], [7]). Ookla's guides describe a
median-style reduction for the same reason ([2], [11]).

Both numbers are reported side by side in the app; neither is "the truth". The
byte-counted steady-state figure is what a real transfer achieves; the p90 is what
Cloudflare would show for the same run.

### 3.3 Latency and jitter

```
latency  = RTT of the best (or median) probe            [ms]
jitter   = Σ|RTT[i] − RTT[i−1]| / (n − 1)               [ms]   (mean absolute difference)
loss     = failed_probes / total_probes × 100           [%]
```

### 3.4 Loaded latency and the bufferbloat grade

Bufferbloat is the delay added by queues that fill while the link is busy. The test
shape is standardised across Waveform/BufferSpeed/Cloudflare/LibreQoS ([8], [12], [4]):

```
baseline = median latency, idle
loaded   = median latency, measured from probes fired during saturation
added    = max(loaded_download, loaded_upload) − baseline
```

The published grading of `added` ([13], [14]):

| Grade | Added latency | Meaning |
| --- | --- | --- |
| A+ | ≤ 5 ms | Loaded latency effectively unchanged |
| A | 5–30 ms | Small increase under load |
| B | 30–60 ms | Moderate increase |
| C | 60–200 ms | Real-time traffic (calls, games) may suffer |
| D | 200–400 ms | Large rise while busy |
| F | > 400 ms | Severe — the connection is unusable for calls under load |

Some sources grade the *percentage* increase over the baseline rather than absolute
milliseconds ([13]); others use a p95−median spread ([8]). NetGauge uses the absolute
added milliseconds and also reports both loaded-latency series so either variant can
be recomputed.

Cloudflare's rule of thumb: loaded within 5–10 ms of unloaded means the router has
working queue management (AQM/CAKE) ([15]).

## 4. What each public test does

| | **Ookla Speedtest** | **Cloudflare** | **fast.com** | **M-Lab NDT** | **NetGauge** |
| --- | --- | --- | --- | --- | --- |
| Streams | 4–16 adaptive ([9], [10]) | several concurrent sets ([4]) | 1–4 (Netflix Open Connect) ([9]) | single/few ([16]) | 6 (1–16 configurable) |
| Duration | ~10 s per direction ([2]) | size-ramped until requests reach 1 s ([4]) | ~10–20 s | fixed duration | 10 s per direction (2–60 s) |
| Download result | median-style reduction ([11]) | **p90** of samples ([7]) | streaming-style throughput | mean over window | steady-state bytes **and** p90 |
| Latency | lowest of N probes ([5]) | median TTFB (`latencyPercentile` 0.5) ([4]) | basic | basic | best-of-N **and** median |
| Jitter | reported | mean consecutive delta ([7]) | — | — | mean consecutive delta |
| Loaded latency / bufferbloat | not in the basic test ([9]) | yes, probes during both phases ([4]) | no | no | yes, ± A+–F grade |
| Packet loss | CLI only | UDP/TURN probes ([4]) | no | yes | HTTP probe failures only |
| Server | ISP-hosted, lowest latency out of ~10 ([1], [6]) | nearest Cloudflare edge (anycast) | Netflix CDN | M-Lab pods | any NetGauge server, or Cloudflare |

Two things to take away:

- **Different tools legitimately disagree.** Same line, three servers, three paths.
  A fast.com result within ~15% of Ookla is considered normal ([9]).
- **None of them measure the internet.** Each measures one path to one server.

## 5. Accuracy limits you cannot engineer away

| Source | Effect | Notes |
| --- | --- | --- |
| Link-layer + IP/TCP headers | measured rate ≈ 94–95% of a full-duplex line rate | 1460/1538 bytes on Ethernet ([3]) |
| Wi-Fi | the largest variable on most laptops | 802.11 retries, airtime sharing, band steering |
| Cross traffic | any other device on the LAN changes the result | the test saturates the link by design, which can *hurt* what you are doing |
| Server capacity / peering | a slow server caps the result regardless of your line | Ookla hosts ISP-side servers precisely to avoid this ([9]) |
| Device CPU & browser | crypto, TLS and stream copying can cap a multi-gigabit test | a busy CPU looks like a slow line |
| Buffers | loaded latency inflates while throughput stays high | this is bufferbloat, not low speed |
| Test duration | short tests never leave slow start | Cloudflare ramps sizes for this reason ([4]) |
| Compression | zeros compress; the payload must be incompressible | all engines use random-ish data ([17]) |

Practical guidance, echoed by every write-up cited here: close other tabs and
downloads, prefer a wired connection for anything above a few hundred Mbps, run the
test two or three times and look at the spread rather than one number, and pick a
server near you if the tool lets you.

## 6. What NetGauge implements

### 6.1 Engine behaviour

| Step | Implementation |
| --- | --- |
| Latency | `pingCount` (default 9) probes; first discarded from the statistics; best-of reported as `latencyMs`, median as `medianLatencyMs`, mean absolute difference as `jitterMs`, failures as `lossPercent`, all raw RTTs as `latencySeries` |
| Download | `concurrency` (default 6) streams, adaptively sized requests, byte meter sampled every ~40 ms |
| Upload | same, but metered through `XMLHttpRequest.upload.onprogress` when available so every byte is counted *as it is sent* — `fetch` has no upload progress event, which is why a fetch-only upload test cannot show a live number |
| Warm-up | first `warmupFraction` (20%) of each phase excluded from the result |
| Result | `bytes ÷ time` over the steady window (`downBps`), plus p90 (`downBpsP90`) and median (`downBpsMedian`) of the same samples |
| Loaded latency | probes every ~350 ms during both transfer phases; median reported per direction; `bufferbloatMs` = max(loaded) − idle, with an A+–F grade |
| Server metadata | `/api/speed/meta`, or any mapper supplied by the caller (Cloudflare's `/meta` has a different shape, translated in `mapCloudflareMeta`) |
| Payload | one reusable buffer, non-zero pseudo-random-ish bytes, so nothing compresses it away |

### 6.2 Server endpoints

| Endpoint | Behaviour |
| --- | --- |
| `GET /api/speed/ping` | 13-byte response, `no-store` — the round trip dominates, not the payload |
| `GET /api/speed/download?bytes=N` | streams exactly N bytes (default 32 MiB, max 1 GiB), 64 KiB chunks, `content-length` exact, `content-encoding: identity`, backpressure-aware queue of 4 chunks |
| `POST /api/speed/upload` | drains the body without buffering and echoes `{received}` |
| `GET /api/speed/meta` | server identity + best-effort ISP/geo lookup, 15-minute cache, never fails the request |
| all | `access-control-allow-origin: *` **and** `timing-allow-origin: *` — without the latter a browser reports 0 for every cross-origin timing field |

Next.js runs with `compress: false` so gzip can never inflate a measurement.

### 6.3 What NetGauge deliberately does *not* claim

- It cannot measure packet loss the way Cloudflare's TURN probes do; losses reported
  here are *request* failures.
- The desktop app can measure against any NetGauge server (or Cloudflare), so the
  number describes the path to whichever server is selected — the app shows which one.
- A loopback or same-machine server measures the machine, not the internet. That is
  why the default is a public server rather than a bundled one.

## 7. Reading your own results

| What you see | What it usually means |
| --- | --- |
| Download ≈ plan speed, upload much lower | normal on cable/DSL — upstream is deliberately smaller |
| p90 much higher than the steady figure | the line is bursty; the steady figure is what a big download sustains |
| Ping low, loaded latency 5–10 ms higher | healthy queue management |
| Ping low, loaded latency 100 ms+ | bufferbloat — enable SQM/CAKE on the router |
| Everything low, ping high | Wi-Fi, a bad route, or a distant server |
| Numbers swing 2× between runs | cross traffic, Wi-Fi airtime, or a busy test server |
| Exactly the plan's rated speed | a burst allowance; watch the p90 and the steady figure over a longer phase |

---

## References

1. *Verifying Network Performance with Nothing but Curl* — Cloudflare's public
   `speed.cloudflare.com/__down?bytes=N` and `/__up` endpoints.
   <https://medium.com/@epappas/verifying-network-performance-with-nothing-but-curl-3e50b8b21870>
2. DCSpeedTest, *Speed Test 2026: How It Works & What Results Mean* — 4–16 parallel
   streams, ~1 s latency phase, ~10 s per direction, median reduction.
   <https://dcspeedtest.com/blog/speed-test-complete-guide-2026>
3. ThousandEyes documentation, *Speed Tests* — application-layer measurement and the
   ~95 Mbps ceiling on a 100 Mbit/s link due to overhead.
   <https://docs.thousandeyes.com/product-documentation/connected-devices/connected-devices-tests/network/speed-tests>
4. `cloudflare/speedtest` README — engine config defaults: `downloadApiUrl`,
   `uploadApiUrl`, `latencyPercentile: 0.5`, `bandwidthPercentile: 0.9`,
   `bandwidthMinRequestDuration: 10`, `bandwidthFinishRequestDuration: 1000`,
   `loadedLatencyThrottle: 400`, `loadedRequestMinDuration: 250`, the measurement
   ramp-up list, and the results API (`getUnloadedLatency`, `getDownLoadedLatency`,
   `getDownloadBandwidthPoints`).
   <https://github.com/cloudflare/speedtest>
5. Ookla support, *How does Speedtest Custom work?* — repeated latency probes where
   "the lowest value determin[es] the final result", multiple connections, chunk and
   buffer sizing adjusted from real-time speed, extra connections established if the
   first half of the test shows they are needed.
   <https://support.ookla.com/hc/en-us/articles/115000234391-How-does-Speedtest-Custom-work>
6. *Empirical Characterization of Ookla's Speed Test Platform* (UCSD) — server
   selection from ~10 nearest candidates by ping, then parallel HTTPS/TCP transfers.
   <https://cseweb.ucsd.edu/~zez003/splatency-main.pdf>
7. *About the Cloudflare Speed Test* — "progressively larger files … taking the 90th
   percentile speed"; ping as time-to-first-byte; jitter as the average delta between
   consecutive pings. <https://speed.cloudflare.com/about>
8. Bufferbloat.org, *What a bufferbloat speed test measures beyond speed* — quiet-line
   ping, latency during download/upload load, and p95 spread instead of generic jitter.
   <https://bufferbloat.org/learn/bufferbloat-speed-test>
9. Speedtest.how, *Ookla vs Fast.com* — 4–16 adaptive connections, ISP-hosted servers,
   fast.com's 1–4 streams, and the "within 15% is normal" guidance.
   <https://speedtest.how/speed-test/ookla-vs-fast/>
10. SpeedTestHQ, *How a speed test works technically* — slow start, parallel streams,
    100–200 ms sampling, discarding early samples, single-stream underestimation.
    <https://speedtesthq.com/guides/learn/how-speed-test-works-technically>
11. ADHDecode, *Speed tests: why they lie* — Ookla's parallel connections, average
    reporting, and why the same line measures differently between runs.
    <https://adhdecode.com/networking/network-performance-and-qos/speed-tests-how-they-work-why-they-lie/>
12. LibreQoS, *Internet Quality Test* — per-phase median/mean/min/max/stddev/jitter and
    a spike-sensitive bufferbloat metric (p90 phase latency − p5 baseline).
    <https://test.libreqos.com/advanced/>
13. BufferSpeed, *Bufferbloat definition and loaded-latency grades* — A+ ≤5 ms,
    A 5–30, B 30–60, C 60–200, D 200–400, F >400 ms.
    <https://bufferspeed.com/learn/bufferbloat>
14. *Free Bufferbloat & Internet Speed Test* — the same three-phase shape
    (baseline → download load → upload load) with probes during load.
    <https://shoplikesam.com/internet-tools/bufferbloat-and-internet-speed-test/>
15. DCSpeedTest, *Cloudflare Speed Test review* — "loaded ≈ unloaded within 5–10 ms"
    as the healthy signal, and the 10× rule for severe bufferbloat.
    <https://dcspeedtest.com/blog/cloudflare-speed-test-review-2026>
16. ACM, *You wanna see some real speed? Comparative analysis of M-Lab and Cloudflare
    speed test results* — methodology differences between providers.
    <https://dl.acm.org/doi/10.1145/3763400.3763444>
17. *Ich habe einen echten Speedtest in Vanilla JS gebaut* — why incompressible
    payloads are required, and why uploads must use XHR progress for a live rate.
    <https://dev.to/nevik_schmidt_3635afa2b85/ich-habe-einen-echten-speedtest-in-vanilla-js-gebaut-mit-cloudflare-api-4n37>
