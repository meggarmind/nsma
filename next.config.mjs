/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone mode for Docker deployment (reduces image size by 80%)
  output: 'standalone',
  // Allow server actions for sync triggers
  experimental: {
    serverActions: {
      // Dynamic port: supports both dev (3100) and prod (5100) instances
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
        `localhost:${process.env.PORT || 3100}`,
      ],
    },
  },
};

export default nextConfig;
