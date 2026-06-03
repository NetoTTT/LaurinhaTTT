FROM node:20-alpine AS builder
WORKDIR /app
# Não baixar o Chromium do Puppeteer no build — usamos o do sistema no runtime
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY services/whatsapp-adapter ./services/whatsapp-adapter
RUN npm install
RUN npm run build -w packages/shared-types
RUN npm run build -w services/whatsapp-adapter

FROM node:20-alpine
WORKDIR /app

# Chromium do sistema + libs necessárias para o whatsapp-web.js rodar headless
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV WA_SESSION_PATH=/app/wa-session

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/services/whatsapp-adapter/dist ./services/whatsapp-adapter/dist
COPY --from=builder /app/services/whatsapp-adapter/package.json ./services/whatsapp-adapter/package.json

EXPOSE 3322
CMD ["node", "services/whatsapp-adapter/dist/index.js"]
