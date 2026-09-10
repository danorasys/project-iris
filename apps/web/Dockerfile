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

# Build stage, compiles the production bundle.
FROM node:22-alpine AS build
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
