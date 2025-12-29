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

  // Security headers for all responses
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Prevent MIME type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // XSS protection (legacy browsers)
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Control referrer information
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Disable unnecessary browser features
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
