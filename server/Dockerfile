FROM node:24-slim AS build
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --workspace server
COPY server server
RUN npm run build --workspace server

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    MODEL_CACHE_DIR=/app/.model-cache
COPY package.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --workspace server --omit=dev \
    && mkdir -p /app/.model-cache \
    && chown node:node /app/.model-cache
COPY --from=build /app/server/dist server/dist
USER node
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
