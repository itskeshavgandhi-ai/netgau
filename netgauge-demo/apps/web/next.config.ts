import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The speed-test endpoints stream raw bytes; gzip would distort the measurement.
  compress: false,
  transpilePackages: ['@netgauge/core'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/api/speed/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
