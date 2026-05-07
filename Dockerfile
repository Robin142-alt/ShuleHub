FROM node:20-bookworm-slim AS build

WORKDIR /app

# Install dependencies first (better Docker layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY .env.example ./
COPY jest.integration.config.js ./
COPY api ./api
COPY apps ./apps

RUN npm run build

# ─── Production Runtime ──────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

# Install security updates and dumb-init for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Run as non-root user for security
RUN groupadd -r shulehub && useradd -r -g shulehub -s /bin/false shulehub

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built output
COPY --from=build /app/dist ./dist

# Set ownership
RUN chown -R shulehub:shulehub /app

USER shulehub

EXPOSE 3000

# Health check for Docker and Kubernetes readiness
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "const http=require('http');const req=http.get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/health/ready'},res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));"

# Use dumb-init to properly handle signals for graceful shutdown
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
