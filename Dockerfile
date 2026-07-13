# Multi-stage build: server + prebuilt snippet served as a static asset.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/server/package.json packages/server/
COPY packages/snippet/package.json packages/snippet/
COPY packages/dashboard/package.json packages/dashboard/
RUN pnpm install --frozen-lockfile
COPY packages/server packages/server
COPY packages/snippet packages/snippet
COPY packages/dashboard packages/dashboard
RUN pnpm -r build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/server/package.json packages/server/
RUN pnpm install --filter @effimero/server --prod
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/dashboard/dist packages/server/public
COPY --from=build /app/packages/snippet/dist/effimero.js packages/server/public/effimero.js
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
