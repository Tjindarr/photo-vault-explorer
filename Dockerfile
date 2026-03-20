##############################################
# SnapVault — Single-container Unraid build
##############################################

# ---- Stage 1: Build React frontend ----
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# ---- Stage 2: Production image ----
FROM python:3.12-slim

# Install nginx and supervisor
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx supervisor libffi-dev libde265-dev libheif-dev && \
    rm -rf /var/lib/apt/lists/*

# Create data directories
RUN mkdir -p /data/photos /data/thumbnails /data/db

# ---- Python backend ----
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

# ---- Frontend static files ----
COPY --from=frontend /app/dist /usr/share/nginx/html

# ---- Nginx config ----
COPY docker/nginx.conf /etc/nginx/sites-available/default

# ---- Supervisor config ----
COPY docker/supervisord.conf /etc/supervisor/conf.d/snapvault.conf

# Environment
ENV PHOTOS_DIR=/data/photos
ENV THUMB_DIR=/data/thumbnails
ENV DB_PATH=/data/db/snapvault.db

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["supervisord", "-n", "-c", "/etc/supervisor/conf.d/snapvault.conf"]
