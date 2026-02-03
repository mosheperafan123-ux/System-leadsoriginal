# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependencias de Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production

# Instalar Playwright browsers
RUN npx playwright install chromium

COPY . .

# Production stage
FROM node:20-slim

WORKDIR /app

# Instalar dependencias de Playwright en runtime
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-liberation \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app .
COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=3000
ENV HEADLESS_MODE=true

EXPOSE 3000

CMD ["node", "src/dashboard/server.js"]
