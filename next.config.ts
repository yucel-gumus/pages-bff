import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
    const allow = origins.length ? origins.join(', ') : 'https://yucel-gumus.github.io';
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: allow },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
          { key: 'Vary', value: 'Origin' },
        ],
      },
    ];
  },
};

export default nextConfig;