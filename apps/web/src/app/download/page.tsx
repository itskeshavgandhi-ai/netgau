import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import DownloadPanel from '@/components/DownloadPanel';

export const metadata: Metadata = {
  title: 'Download NetGauge for Windows',
  description:
    'Download NetGauge — a free, open-source network monitor for Windows that lives in your system tray with live up/down meters, a built-in speed test and deep visual customisation.',
};

const REQUIREMENTS = [
  ['OS', 'Windows 10 1809 or newer, Windows 11'],
  ['Architecture', 'x64 and arm64'],
  ['Size', '≈ 90 MB installed'],
  ['Runtime', 'None — the runtime is bundled'],
  ['Permissions', 'No admin rights required'],
];

const TIPS = [
  {
    title: 'Pin it so it always shows',
    body: 'Windows hides tray icons after a while. Open Settings → Personalisation → Taskbar → Other system tray icons and switch NetGauge on so the live meter never collapses into the overflow flyout.',
  },
  {
    title: 'Start it with Windows',
    body: 'Studio → Behaviour → “Launch at login”. NetGauge registers a per-user login item, so nothing is written to system-wide startup and no admin rights are needed.',
  },
  {
    title: 'Keep just the icon',
    body: 'Turn off the floating widget in Studio → Widget and the tray icon keeps monitoring on its own. Hover it for exact numbers, click it to bring the window back.',
  },
  {
    title: 'Match your fonts and colours',
    body: 'Studio → Appearance has ten bundled typefaces, an accent picker, acrylic/mica depth, opacity and corner radius. Everything applies live and is remembered between launches.',
  },
];

export default function DownloadPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pt-12 pb-20 sm:px-6">
        <div className="max-w-2xl">
          <span className="chip">Downloads</span>
          <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">
            Get <span className="gradient-text">NetGauge</span> for your desktop
          </h1>
          <p className="mt-4 text-pretty text-muted sm:text-lg">
            Free, open source and signed-out-of-the-box honest: the installer does one thing, puts a live network
            meter in your tray, and never phones home.
          </p>
        </div>

        <div className="mt-10">
          <DownloadPanel />
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <section>
            <h2 className="text-2xl font-semibold">After you install</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {TIPS.map((tip) => (
                <article key={tip.title} className="glass-soft rounded-2xl p-5">
                  <h3 className="font-display text-[15px] font-semibold">{tip.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{tip.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="glass h-fit rounded-[22px] p-6">
            <h2 className="text-lg font-semibold">System requirements</h2>
            <dl className="mt-5 divide-y divide-white/[0.07]">
              {REQUIREMENTS.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-xs font-semibold tracking-[0.14em] text-faint uppercase">{label}</dt>
                  <dd className="text-right text-sm text-mist">{value}</dd>
                </div>
              ))}
            </dl>
            <Link href="/#test" className="btn btn-ghost mt-6 w-full">
              Run a speed test first
            </Link>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
