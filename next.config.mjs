/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone mode for Docker deployment (reduces image size by 80%)
  output: 'standalone',
  // Allow server actions for sync triggers
  experimental: {
    serverActions: {
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['localhost:3100'],
    },
  },
};

export default nextConfig;
