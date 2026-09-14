import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';

const siteUrl = process.env.NETGAUGE_SITE_URL ?? 'https://netgauge.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'NetGauge — Internet speed test & live network monitor',
    template: '%s · NetGauge',
  },
  description:
    'Test your connection in seconds with NetGauge — accurate download, upload, ping and jitter. Then keep watching your network live from the Windows tray with the free NetGauge app.',
  keywords: [
    'speed test',
    'internet speed test',
    'bandwidth test',
    'ping test',
    'network monitor',
    'windows tray app',
    'netgauge',
  ],
  openGraph: {
    title: 'NetGauge — Internet speed test & live network monitor',
    description:
      'A Speedtest-class web client plus a glassy Windows tray app that watches your connection in real time.',
    url: siteUrl,
    siteName: 'NetGauge',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NetGauge — Internet speed test',
    description: 'Test your connection in seconds, then monitor it live from the Windows tray.',
  },
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#04060d',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="aurora" aria-hidden />
        <div className="aurora-grid" aria-hidden />
        {children}
      </body>
    </html>
  );
}
