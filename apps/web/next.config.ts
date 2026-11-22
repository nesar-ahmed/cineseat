import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @cineseat/shared is a workspace package (guideline section 4.6).
  transpilePackages: ['@cineseat/shared'],
  // Development only: the indicator would sit on the admin sidebar's collapse button (bottom left).
  devIndicators: { position: 'bottom-right' },
};

export default nextConfig;
