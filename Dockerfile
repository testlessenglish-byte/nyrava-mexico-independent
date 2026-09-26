# ==============================================================================
# Multi-stage Dockerfile for Nyrava México Node/Linux Production Target
# ==============================================================================

# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Browser-safe public build arguments required for Vite client-side bundle
ARG VITE_SUPABASE_URL=https://your-project-ref.supabase.co
ARG VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_or_anon_key

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# Install all dependencies (including devDependencies required for bundling)
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source code
COPY . .

# Set environment for Node production target build
ENV NODE_ENV=production
ENV NITRO_PRESET=node-server

# Build the application with the standalone Node server target
RUN npm run build

# Stage 2: Production runner
FROM node:22-alpine AS runner

WORKDIR /app

# Set production runtime environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NITRO_PRESET=node-server

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled Nitro server output and static client assets from builder
COPY --from=builder --chown=node:node /app/.output ./.output

# Set proper ownership for non-root user
RUN chown -R node:node /app

# Run as non-root user
USER node

# Expose only the application port
EXPOSE 3000

# Container healthcheck querying the lightweight public /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the Node server
CMD ["node", ".output/server/index.mjs"]
