# Multi-stage build for OwlPlayer
# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm install

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build

# Stage 2: Build Go backend
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY *.go ./
COPY utils/ ./utils/
COPY services/ ./services/
COPY api/ ./api/
COPY models/ ./models/
COPY migrations/ ./migrations/

# Remove test files before building to reduce image size
RUN find . -name "*_test.go" -type f -delete

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -o streaming-server .

# Stage 3: Runtime image with ffmpeg
FROM ubuntu:22.04

# Install required dependencies: ffmpeg, gosu, curl, and envsubst
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    gettext-base \
    gosu && \
    rm -rf /var/lib/apt/lists/*

# Verify installations
RUN ffmpeg -version

# Create non-root user
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Copy backend binary
COPY --from=backend-builder /app/streaming-server /app/streaming-server

# Copy frontend dist
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copy migrations
COPY migrations /app/migrations

# Copy runtime configuration template and entrypoint
COPY config.docker.yaml /app/config.template.yaml
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create necessary directories with proper ownership
RUN mkdir -p /app/config /app/.cache /app/.data && \
    chown -R appuser:appuser /app

# Set environment variable for config path
ENV CONFIG_PATH=/app/config/config.yaml

# Expose port
EXPOSE 8080

# Use entrypoint to fix permissions before switching to appuser
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Default command (can be overridden)
CMD ["/app/streaming-server"]
