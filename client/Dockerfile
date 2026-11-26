# ==========================================
# Webhook Processor - Next.js Frontend Dockerfile
# Multi-stage build with Node.js 22 Alpine
# ==========================================

# 1. Dependencies and build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files for dependency caching
COPY package*.json ./

# Install dependencies cleanly
RUN npm ci

# Copy application source
COPY . .

# Build argument for API base URL (defaults to host port 3001)
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js production bundle
RUN npm run build

# 2. Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Copy package manifests and production artifacts
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000

# Start Next.js on port 3000 binding to all network interfaces
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
