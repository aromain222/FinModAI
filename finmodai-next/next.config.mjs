const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || process.env.ROOT_DOMAIN || '';
const allowedOrigins = ['localhost:3000', '127.0.0.1:3000'];

if (rootDomain) {
  allowedOrigins.push(rootDomain, `*.${rootDomain}`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
      {
        protocol: 'https',
        hostname: 'commons.wikimedia.org',
      },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins
    }
  },
};

export default nextConfig;
