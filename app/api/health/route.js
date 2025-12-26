import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { CONFIG_DIR } from '@/lib/constants';

/**
 * Health check endpoint for Docker container monitoring
 * Used by Docker HEALTHCHECK instruction and external monitoring tools
 */
export async function GET() {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    configDir: existsSync(CONFIG_DIR),
    nodeEnv: process.env.NODE_ENV || 'development'
  };

  // If critical dependencies are missing, return unhealthy
  const isHealthy = checks.configDir;

  return NextResponse.json(checks, {
    status: isHealthy ? 200 : 503
  });
}
