FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY services/dashboard ./services/dashboard
RUN npm install
RUN npm run build -w packages/shared-types
RUN npm run build -w services/dashboard

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# root node_modules (hoisted pelo workspace — contém ioredis e deps do dashboard)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# build do SvelteKit (adapter-node gera build/index.js)
COPY --from=builder /app/services/dashboard/build ./build
EXPOSE 3323
CMD ["node", "build"]
