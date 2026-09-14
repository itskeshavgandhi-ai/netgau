import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import SpeedTest from '@/components/SpeedTest';
import WidgetPreview from '@/components/WidgetPreview';

const FEATURES = [
  {
    title: 'Live in your tray',
    body: 'Download and upload meters redrawn every sample, a tooltip with the current rate, and a sparkline that shows the last minute of traffic.',
    icon: (
      <path d="M3 17V9m5 8V5m5 12v-6m5 6V8" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    title: 'Speedtest-grade accuracy',
    body: 'Six parallel streams, incompressible payloads, TCP slow-start discarded, ping and jitter from nine probes. The same engine runs on this page and in the app.',
    icon: <path d="M12 3a9 9 0 1 0 9 9M12 12l5-4" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: 'Make it yours',
    body: 'Ten bundled typefaces, accent colours, acrylic or mica depth, widget scale, units and sample rate. Every setting persists and applies instantly.',
    icon: <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1" strokeLinecap="round" />,
  },
  {
    title: 'Private by design',
    body: 'No account, no telemetry, no ads. Test history stays in local storage, and the whole project is MIT licensed on GitHub.',
    icon: <path d="M12 3l7 3v6c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V6l7-3Zm-2.5 9 2 2 3.5-4" strokeLinecap="round" strokeLinejoin="round" />,
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Install in a click',
    body: 'A 90 MB installer for Windows 10 and 11. No account, no bundled offers, uninstall from Settings like anything else.',
  },
  {
    n: '02',
    title: 'It lands in your tray',
    body: 'NetGauge starts monitoring the second it launches. The tray icon fills up as traffic flows — hover it for exact numbers.',
  },
  {
    n: '03',
    title: 'Tune it in Studio',
    body: 'Pick fonts, accent colour, glass depth and units. Pin the widget anywhere on screen, or hide it and keep just the icon.',
  },
];

const FAQ = [
  {
    q: 'Is NetGauge free?',
    a: 'Yes. The web speed test and the desktop app are both free and MIT licensed. There are no accounts, no ads and no upsells.',
  },
  {
    q: 'Which Windows versions are supported?',
    a: 'Windows 10 (1809 or newer) and Windows 11. On Windows 11 the widget uses the native acrylic and mica materials; on Windows 10 it falls back to a translucent surface with a CSS blur.',
  },
  {
    q: 'How accurate is the speed test?',
    a: 'It opens six parallel streams, uses incompressible payloads so nothing can be compressed away, discards the first 20% of each phase as TCP slow-start, and reports ping as the best of nine probes. Results are measured against this server, so they reflect the path to it rather than a nearby CDN edge.',
  },
  {
    q: 'Does the tray app use resources in the background?',
    a: 'It reads interface counters once per second (configurable down to 250 ms) and redraws a 16×16 icon. There is no packet capture and no proxying, so idle cost is negligible — and you can pause monitoring from the tray menu.',
  },
  {
    q: 'Where does my test history go?',
    a: 'Nowhere. Results are written to your browser local storage on this site and to a JSON file in your user profile in the app. Nothing is uploaded.',
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* ------------------------------- hero ------------------------------- */}
        <section className="mx-auto max-w-5xl px-4 pt-12 text-center sm:px-6 sm:pt-16">
          <div className="rise inline-flex">
            <span className="chip !normal-case !tracking-normal">
              <span className="h-1.5 w-1.5 rounded-full bg-lime" />
              Free · No signup · Open source
            </span>
          </div>
          <h1 className="rise mt-5 text-balance text-4xl leading-[1.05] font-semibold sm:text-6xl" style={{ animationDelay: '60ms' }}>
            Know exactly how fast
            <br className="hidden sm:block" /> your internet <span className="gradient-text">really is</span>.
          </h1>
          <p className="rise mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg" style={{ animationDelay: '120ms' }}>
            Run an accurate speed test in about twenty seconds — then keep watching your connection live from the
            Windows tray with the NetGauge app.
          </p>
          <div className="rise mt-7 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: '180ms' }}>
            <a href="#test" className="btn btn-primary">
              Test my connection
            </a>
            <Link href="/download" className="btn btn-ghost">
              Download for Windows
            </Link>
          </div>
        </section>

        <SpeedTest />

        {/* ----------------------------- features ----------------------------- */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="max-w-2xl">
            <span className="chip">The app</span>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">A network monitor that stays out of the way</h2>
            <p className="mt-3 text-pretty text-muted">
              NetGauge sits in your system tray, renders through the desktop with modern transparency effects, and
              tells you the truth about your connection at a glance.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="glass group rounded-[22px] p-6 transition-transform duration-300 hover:-translate-y-1">
                <div className="glass-soft flex h-11 w-11 items-center justify-center rounded-2xl text-cyan">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
                    {feature.icon}
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------------------------- how it works -------------------------- */}
        <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <WidgetPreview />
            <div>
              <span className="chip">How it works</span>
              <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">Three steps, then it just runs</h2>
              <ol className="mt-8 space-y-6">
                {STEPS.map((step) => (
                  <li key={step.n} className="flex gap-4">
                    <span className="num shrink-0 text-sm text-cyan">{step.n}</span>
                    <div>
                      <h3 className="text-base font-semibold">{step.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link href="/download" className="btn btn-primary mt-8">
                Get NetGauge
              </Link>
            </div>
          </div>
        </section>

        {/* -------------------------------- faq ------------------------------- */}
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-semibold sm:text-4xl">Questions</h2>
          <div className="mt-10 divide-y divide-white/[0.07] overflow-hidden rounded-[22px] glass">
            {FAQ.map((item) => (
              <details key={item.q} className="group p-5 sm:p-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-display text-[15px] font-semibold">
                  {item.q}
                  <span className="glass-soft flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition group-open:rotate-45">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-3 pr-10 text-sm leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* -------------------------------- cta ------------------------------- */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="glass relative overflow-hidden rounded-[28px] px-6 py-14 text-center sm:px-12">
            <div
              className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
              style={{ background: 'radial-gradient(circle, #22d3ee, transparent 65%)' }}
              aria-hidden
            />
            <h2 className="relative text-3xl font-semibold sm:text-4xl">Keep an eye on your connection</h2>
            <p className="relative mx-auto mt-3 max-w-lg text-pretty text-muted">
              Free forever, works offline, and takes up 16 pixels of your taskbar.
            </p>
            <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link href="/download" className="btn btn-primary">
                Download for Windows
              </Link>
              <a
                href="https://github.com/thekeshavgandhi-dev/netgauge-demo"
                target="_blank"
                rel="noreferrer noopener"
                className="btn btn-ghost"
              >
                View source
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
