# Build context is the repo root, not apps/web, so npm can resolve
# packages/shared-types as a workspace dependency.

# Dev stage, used by docker-compose. Hot reload, code mounted as a volume.
FROM node:22-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/web/package.json ./apps/web/package.json
RUN npm install
COPY apps/web ./apps/web
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# Build stage, compiles the production bundle. VITE_API_BASE_URL is a build
# argument because Vite bakes it into the JS, a static site can't read env
# vars at runtime. The CI passes the real URL. Without it the build falls back
# to the local one, the same default httpClient.ts uses.
FROM node:22-alpine AS build
ARG VITE_API_BASE_URL=http://localhost:8080/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/web ./apps/web
RUN npm install
WORKDIR /app/apps/web
RUN npm run build

# Runtime stage, serves the bundle with nginx. This is what actually ships.
# The unprivileged image runs nginx as a normal user (101) instead of root,
# so it listens on 8080. The 1.29 line is the one nginx recommends and gets
# the fixes first (the stable 1.28 package had open HIGH issues).
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
# The upgrade takes the security fixes that came out after the base image
# was built. It needs root for a moment, then it goes back to the nginx user.
USER root
RUN apk upgrade --no-cache
USER 101
# The files stay owned by root, so nginx can read them but not change them.
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
# Lets Docker (and docker compose up --wait) know when nginx is really serving.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
