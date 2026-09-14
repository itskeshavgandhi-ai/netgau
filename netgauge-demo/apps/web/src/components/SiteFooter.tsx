import Link from 'next/link';
import { Logo } from '@/components/SiteHeader';

const FOOTER_LINKS = [
  {
    title: 'Product',
    links: [
      { label: 'Speed test', href: '/#test' },
      { label: 'How it works', href: '/#how' },
      { label: 'Download', href: '/download' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'GitHub', href: 'https://github.com/thekeshavgandhi-dev/netgauge-demo' },
      { label: 'Report an issue', href: 'https://github.com/thekeshavgandhi-dev/netgauge-demo/issues' },
      { label: 'Releases', href: 'https://github.com/thekeshavgandhi-dev/netgauge-demo/releases' },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="relative mt-20 border-t border-white/[0.06]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="font-display text-[17px] font-semibold">
              Net<span className="gradient-text">Gauge</span>
            </span>
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            A speed test you can trust and a network monitor that lives in your tray. Open source, no accounts,
            no ads.
          </p>
        </div>

        {FOOTER_LINKS.map((group) => (
          <div key={group.title}>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-faint uppercase">{group.title}</p>
            <ul className="mt-4 space-y-2.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-muted transition hover:text-mist"
                    {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="safe-bottom mx-auto flex max-w-6xl flex-col gap-2 border-t border-white/[0.06] px-4 pt-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} NetGauge. MIT licensed.</p>
        <p className="num">Results are measured against this server, not a CDN.</p>
      </div>
    </footer>
  );
}
