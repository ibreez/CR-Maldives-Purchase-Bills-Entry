# ==============================================================================
# Phase 46 — Production Multi-Stage Dockerfile
# Maldives Purchase Bills Entry & Tax Compliance Engine
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build & Assets Compilation
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install build prerequisites
RUN apk add --no-cache openssl libc6-compat

# Copy package manifests and Prisma schema
COPY package*.json ./
COPY src/db/schema.prisma ./src/db/schema.prisma

# Install all dependencies (including devDependencies for compilation)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy application source code
COPY . .

# Compile frontend (Vite) and backend bundle (esbuild)
ENV NODE_ENV=production
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Minimal Runtime
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Install OpenSSL for Prisma engine binary support and curl/wget for healthchecks
RUN apk add --no-cache openssl libc6-compat dumb-init

# Create non-privileged service user and group
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Create persistent data directories
RUN mkdir -p /app/data/uploads /app/data/backups && \
    chown -R nodejs:nodejs /app/data

# Copy production artifacts from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/src/db ./src/db

# Switch to non-root user
USER nodejs

# Expose standard production port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Standard container healthcheck against liveness probe
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.cjs"]
