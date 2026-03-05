/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.procore.com' },
      { protocol: 'https', hostname: '**.procorecdn.com' },
    ],
  },
};

export default nextConfig;
