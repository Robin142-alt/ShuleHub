FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./tsconfig.json
COPY apps/sms-relay ./apps/sms-relay
RUN npm ci

FROM deps AS build
RUN npm --prefix apps/sms-relay run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/sms-relay/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
