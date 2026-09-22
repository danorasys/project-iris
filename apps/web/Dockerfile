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

# Build stage, compiles the production bundle. VITE_API_BASE_URL has to be
# an ARG/ENV here (not just a runtime docker-compose env var) because Vite
# reads it at build time and bakes it into the compiled JS — there's no
# "read the env at runtime" for a static site. Defaults to the same value
# the app already falls back to (see httpClient.ts), so a build that
# doesn't pass --build-arg (like today's CI job) behaves exactly as before.
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
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
