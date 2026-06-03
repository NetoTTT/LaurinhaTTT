FROM node:20-alpine AS builder
RUN apk add --no-cache vips-dev fftw-dev build-base python3
WORKDIR /app
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY services/core-backend ./services/core-backend
RUN npm install
RUN npm run build -w packages/shared-types
RUN npm run build -w services/core-backend

FROM node:20-alpine
# Instala docker CLI para que o endpoint de logs possa executar docker logs --follow
RUN apk add --no-cache vips fftw docker-cli
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/services/core-backend/dist ./services/core-backend/dist
COPY --from=builder /app/services/core-backend/package.json ./services/core-backend/package.json
EXPOSE 3321
CMD ["node", "services/core-backend/dist/index.js"]
