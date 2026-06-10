FROM node:20-alpine AS base
WORKDIR /app

# Instalar dependencias nativas necesarias para bcrypt y puppeteer
RUN apk add --no-cache python3 make g++ chromium nss freetype harfbuzz ca-certificates ttf-freefont

# Puppeteer usa Chromium del sistema, no el propio
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# --- Etapa de dependencias ---
FROM base AS deps
COPY package*.json ./
RUN HUSKY=0 npm ci --omit=dev && npm cache clean --force

# --- Etapa de producción ---
FROM base AS production
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Crear directorio de logs y uploads
RUN mkdir -p logs public/uploads

# Usuario no-root por seguridad
RUN addgroup -g 1001 -S nodejs && adduser -S nodeapp -u 1001
RUN chown -R nodeapp:nodejs /app
USER nodeapp

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/auth/login || exit 1

CMD ["node", "server.js"]
