# agency-frontend — static React app served by nginx (non-root, port 8080). linux/arm64 (built by Loop CI).
#   docker build -t agency-frontend . && docker run --rm -p 8080:8080 -e API_URL=http://localhost:8000 agency-frontend

# 1. build: Node only here — it never reaches the running image
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && rm -f dist/config.js   # config.js comes from nginx at runtime (API_URL)

# 2. run: ~20 MB, ~10 MiB RAM
FROM nginxinc/nginx-unprivileged:1.27-alpine
# templates/*.template → envsubst (only variables that exist in the env, so nginx's own $uri stays) → conf.d
COPY nginx/default.conf.template nginx/security-headers.inc.template /etc/nginx/templates/
COPY --from=build /app/dist /usr/share/nginx/html
# the API this build talks to — set per environment (Kubernetes env), never baked in
ENV API_URL=http://localhost:8000
EXPOSE 8080
