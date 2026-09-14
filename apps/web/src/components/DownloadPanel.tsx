'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReleaseAsset, ReleaseInfo } from '@/app/api/releases/route';

type Platform = 'windows' | 'macos' | 'linux' | 'other';

function detectPlatform(ua: string): Platform {
  if (/windows nt|win64|win32/i.test(ua)) return 'windows';
  if (/mac os x|macintosh/i.test(ua)) return 'macos';
  if (/linux|x11/i.test(ua)) return 'linux';
  return 'other';
}

function humanSize(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

const ICONS: Record<Platform, React.ReactNode> = {
  windows: (
    <path d="M3 5.5 10.5 4.4v7.1H3V5.5Zm0 13 7.5 1.1v-7H3v5.9Zm8.5 1.2L21 21V12.6h-9.5v7.1Zm0-15.4v7.2H21V3l-9.5 1.3Z" />
  ),
  macos: (
    <path d="M16.2 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.2-2.6-.1 0-2.4-.9-2.4-3.5ZM14 5.9c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-.9 2.8 1 .1 2-.5 2.6-1.3Z" />
  ),
  linux: (
    <path d="M12 2c-2 0-3.3 1.6-3.3 3.9 0 1.4.3 2.2.3 3.1 0 1.2-1.6 2.6-2.4 4.6-.7 1.8-.9 3.6-.3 4.4.4.5 1 .3 1.4-.1.1 1 .7 1.8 1.8 1.8h5c1.1 0 1.7-.8 1.8-1.8.4.4 1 .6 1.4.1.6-.8.4-2.6-.3-4.4-.8-2-2.4-3.4-2.4-4.6 0-.9.3-1.7.3-3.1C15.3 3.6 14 2 12 2Zm-1.6 3.6c.4 0 .7.5.7 1s-.3 1-.7 1-.7-.5-.7-1 .3-1 .7-1Zm3.2 0c.4 0 .7.5.7 1s-.3 1-.7 1-.7-.5-.7-1 .3-1 .7-1Z" />
  ),
  other: <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />,
};

export default function DownloadPanel() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [platform, setPlatform] = useState<Platform>('windows');

  useEffect(() => {
    setPlatform(detectPlatform(navigator.userAgent));
    fetch('/api/releases', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ReleaseInfo | null) => data && setRelease(data))
      .catch(() => undefined);
  }, []);

  const grouped = useMemo(() => {
    const order: Platform[] = ['windows', 'macos', 'linux', 'other'];
    const assets = release?.assets ?? [];
    return order
      .map((p) => ({ platform: p, assets: assets.filter((a: ReleaseAsset) => a.platform === p) }))
      .filter((g) => g.assets.length > 0);
  }, [release]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {grouped.map(({ platform: p, assets }) => (
        <div
          key={p}
          className={`glass relative flex flex-col rounded-[22px] p-6 ${
            p === platform ? 'ring-1 ring-cyan/40' : ''
          }`}
        >
          {p === platform && (
            <span className="chip absolute -top-3 left-6 !border-cyan/40 !bg-void !text-cyan">Your device</span>
          )}
          <div className="glass-soft flex h-11 w-11 items-center justify-center rounded-2xl text-mist">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              {ICONS[p]}
            </svg>
          </div>
          <h3 className="mt-4 capitalize font-display text-lg font-semibold">
            {p === 'windows' ? 'Windows' : p === 'macos' ? 'macOS' : p}
          </h3>
          <p className="mt-1 text-xs text-faint">
            {p === 'windows' ? 'Windows 10 1809+ and Windows 11, x64 & arm64' : 'Community builds'}
          </p>

          <div className="mt-5 space-y-2">
            {assets.map((asset) => (
              <a
                key={asset.url}
                href={asset.url}
                className="glass-soft flex items-center justify-between gap-3 rounded-xl px-4 py-3 transition hover:border-white/25 hover:bg-white/[0.08]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-mist">
                    {asset.kind === 'installer' ? 'Installer' : asset.kind === 'portable' ? 'Portable' : 'Archive'}
                  </p>
                  <p className="num truncate text-[11px] text-faint">
                    {humanSize(asset.size)} · {asset.name}
                  </p>
                </div>
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-cyan" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
                </svg>
              </a>
            ))}
          </div>

          <p className="mt-auto pt-5 text-[11px] text-faint">
            {release?.fallback
              ? 'Release not published yet — the link resolves once v0.1.0 ships.'
              : `${release?.tag ?? 'v0.1.0'}${
                  release?.publishedAt ? ` · ${new Date(release.publishedAt).toLocaleDateString()}` : ''
                }`}
          </p>
        </div>
      ))}

      {release && grouped.length === 0 && <FallbackCard />}
      {!release && <LoadingCard />}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="glass col-span-full flex items-center gap-4 rounded-[22px] p-6">
      <span className="shimmer h-11 w-11 rounded-2xl" />
      <div className="space-y-2">
        <span className="shimmer block h-3 w-40 rounded-full" />
        <span className="shimmer block h-3 w-24 rounded-full" />
      </div>
    </div>
  );
}

function FallbackCard() {
  return (
    <div className="glass col-span-full rounded-[22px] p-6">
      <h3 className="font-display text-lg font-semibold">Build from source</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        No release has been published for this repository yet. NetGauge builds with a single command on Windows,
        macOS or Linux:
      </p>
      <pre className="num mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-mist">
        {`git clone https://github.com/thekeshavgandhi-dev/netgauge-demo
cd netgauge-demo
npm install
npm run dist:win   # produces the NSIS installer + portable exe in apps/desktop/release`}
      </pre>
    </div>
  );
}
