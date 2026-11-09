import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @cineseat/shared is a workspace package (guideline section 4.6).
  transpilePackages: ['@cineseat/shared'],
};

export default nextConfig;
