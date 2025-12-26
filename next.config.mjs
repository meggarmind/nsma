/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow server actions for sync triggers
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3100'],
    },
  },
};

export default nextConfig;
