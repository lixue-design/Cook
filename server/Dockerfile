FROM node:22-alpine AS build

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/test ./test
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app/server
COPY --from=build /app/server/package*.json ./
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY server/index.js ./index.js
COPY database /app/database
USER node
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
