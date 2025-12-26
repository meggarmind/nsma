# Stage 1: Dependencies
FROM node:18-alpine AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Stage 2: Builder
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build Next.js application (creates .next/standalone directory)
RUN npm run build

# Stage 3: Runner
FROM node:18-alpine AS runner
WORKDIR /app

# Set to production environment
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Configure paths for Docker deployment
ENV NOTION_SYNC_CONFIG_DIR=/config
ENV PROJECTS_BASE_PATH=/projects
ENV PORT=3100
ENV ALLOWED_ORIGINS=localhost:3100

# Copy standalone build from builder stage
# Next.js standalone mode creates a minimal self-contained build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy CLI and lib directories for sync operations
COPY --from=builder --chown=nextjs:nodejs /app/cli ./cli
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib

# Create volume mount points with proper permissions
RUN mkdir -p /config /projects && \
    chown -R nextjs:nodejs /config /projects

# Switch to non-root user
USER nextjs

# Expose application port
EXPOSE 3100

# Health check for container monitoring
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3100/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["node", "server.js"]
