'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const NAV = [
  { href: '/#test', label: 'Speed test' },
  { href: '/#how', label: 'How it works' },
  { href: '/download', label: 'Download' },
];

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? 'border-b border-white/[0.07] bg-void/70 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <Logo className="h-8 w-8" />
          <span className="font-display text-[17px] font-semibold tracking-tight">
            Net<span className="gradient-text">Gauge</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="link-underline text-sm font-medium text-muted transition hover:text-mist">
              {item.label}
            </Link>
          ))}
          <a
            href="https://github.com/thekeshavgandhi-dev/netgauge-demo"
            target="_blank"
            rel="noreferrer noopener"
            className="link-underline text-sm font-medium text-muted transition hover:text-mist"
          >
            GitHub
          </a>
          <Link href="/download" className="btn btn-primary !px-5 !py-2 !text-sm">
            Get the app
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Toggle navigation"
          className="glass-soft flex h-10 w-10 items-center justify-center rounded-xl md:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <nav className="glass mx-4 mb-3 flex flex-col gap-1 rounded-2xl p-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-3 text-sm font-medium text-mist transition hover:bg-white/5"
            >
              {item.label}
            </Link>
          ))}
          <Link href="/download" onClick={() => setOpen(false)} className="btn btn-primary mt-1">
            Get the app
          </Link>
        </nav>
      )}
    </header>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="ng-logo" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" />
      <path d="M6 21.5a10.5 10.5 0 0 1 20 0" fill="none" stroke="url(#ng-logo)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 21.5 22 12" stroke="url(#ng-logo)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16" cy="21.5" r="2.2" fill="#eaf0ff" />
    </svg>
  );
}
