FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json server.mjs mcp-server.mjs ./
RUN npm ci --omit=dev && npm cache clean --force
COPY public ./public
COPY data ./data
COPY scripts ./scripts

RUN mkdir -p /app/data/packages && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=8088
EXPOSE 8088

USER node
CMD ["node", "server.mjs"]
