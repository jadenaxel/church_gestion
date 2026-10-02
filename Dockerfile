FROM node:24.9-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM build AS runtime
ENV NODE_ENV=production \
    BIND_HOST=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S gestionchurch && adduser -S gestionchurch -G gestionchurch && mkdir -p /app/.local/uploads && chown -R gestionchurch:gestionchurch /app
USER gestionchurch
EXPOSE 3000 4000 4011 4012 4013 4014 4015 4016 4017
CMD ["pnpm", "start:services"]
