# ── Stage 1: build frontend + compile better-sqlite3 ──────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install compilation dependencies for native modules (better-sqlite3, canvas…)
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists /var/cache/apt/archives

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: runtime image ─────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install compilation tools again to build native modules from the installed deps
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Copy only what's needed at runtime from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/db ./db
COPY --from=builder /app/node_modules ./node_modules

# tsx is listed in devDependencies; install it for production use inside the container
RUN npm install tsx --no-save

ENV NODE_ENV=production
ENV PORT=5174
ENV SQLITE_PATH=/data/standings.sqlite

EXPOSE 5174

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:${PORT}/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npx", "tsx", "server/index.ts"]