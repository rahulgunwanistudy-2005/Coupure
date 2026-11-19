FROM node:24.19.0-bookworm-slim
WORKDIR /app
COPY wallet/package.json wallet/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY settlement/ ./settlement/
RUN mkdir /data && chown node:node /data
USER node
CMD ["node", "settlement/server.mjs"]
