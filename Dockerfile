# Multi-stage build: server + prebuilt snippet served as a static asset.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/snippet/package.json packages/snippet/
RUN pnpm install --frozen-lockfile
COPY apps/server apps/server
COPY apps/dashboard apps/dashboard
COPY packages/snippet packages/snippet
RUN pnpm -r build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/server/package.json apps/server/
RUN pnpm install --filter @effimero/server --prod
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/dashboard/dist apps/server/public
COPY --from=build /app/packages/snippet/dist/effimero.js apps/server/public/effimero.js
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
