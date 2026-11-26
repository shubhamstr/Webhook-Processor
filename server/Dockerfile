# ==========================================
# Webhook Processor - Server & Workers Dockerfile
# Node.js 22 Alpine
# ==========================================
FROM node:22-alpine

WORKDIR /app

# Install openssl and libc6-compat for Prisma engine support, and curl for healthcheck
RUN apk add --no-cache openssl libc6-compat curl

# Copy package manifests and Prisma schema first for layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies required for Prisma CLI & build)
RUN npm ci

# Generate Prisma Client
RUN npm run prisma:generate

# Copy application source and build configurations
COPY tsconfig*.json nest-cli.json ./
COPY src ./src

# Build NestJS production assets
RUN npm run build

# Create logs directory for Pino logger
RUN mkdir -p logs

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Default command starts the API server
CMD ["node", "dist/main.js"]
