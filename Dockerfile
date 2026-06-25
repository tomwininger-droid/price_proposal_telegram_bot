# Single-instance Telegram quote bot (Node.js + Express, long-polling).
# Uses the system-installed Chromium (via PUPPETEER_EXECUTABLE_PATH) instead of
# Puppeteer's bundled download — smaller image, avoids container-specific
# "can't find Chromium" failures on PaaS platforms.

FROM node:20-slim

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY bot/package*.json ./bot/
RUN cd bot && npm ci --omit=dev

COPY . .

WORKDIR /app/bot
EXPOSE 8080
CMD ["node", "index.js"]
