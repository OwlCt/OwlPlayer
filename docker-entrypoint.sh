#!/bin/bash
set -euo pipefail

APP_USER="${OWLPLAYER_APP_USER:-appuser}"
APP_GROUP="${OWLPLAYER_APP_GROUP:-appuser}"
CONFIG_DIR="${OWLPLAYER_CONFIG_DIR:-/app/config}"
CONFIG_TEMPLATE_PATH="${OWLPLAYER_CONFIG_TEMPLATE_PATH:-/app/config.template.yaml}"
CONFIG_PATH="${CONFIG_PATH:-${CONFIG_DIR}/config.yaml}"
RENDER_CONFIG="${OWLPLAYER_RENDER_CONFIG:-0}"

ensure_dir() {
    local path="$1"
    mkdir -p "$path"
}

fix_permissions() {
    local path="$1"

    if [ ! -e "$path" ]; then
        return
    fi

    if ! chown -R "${APP_USER}:${APP_GROUP}" "$path" 2>/dev/null; then
        echo "Skipping ownership update for $path"
    fi

    if ! chmod -R u+rwX,go+rX "$path" 2>/dev/null; then
        echo "Skipping permission update for $path"
    fi
}

ensure_dir "$CONFIG_DIR"
ensure_dir /app/.cache
ensure_dir /app/.cache/audio
ensure_dir /app/.cache/metadata
ensure_dir /app/.data

if [ "$RENDER_CONFIG" = "1" ] || [ ! -f "$CONFIG_PATH" ]; then
    if [ ! -f "$CONFIG_TEMPLATE_PATH" ]; then
        echo "Config template not found: $CONFIG_TEMPLATE_PATH" >&2
        exit 1
    fi

    echo "Rendering config to $CONFIG_PATH"
    envsubst < "$CONFIG_TEMPLATE_PATH" > "$CONFIG_PATH"
fi

echo "Checking and fixing permissions for mounted directories..."
fix_permissions "$CONFIG_DIR"
fix_permissions /app/.cache
fix_permissions /app/.data
echo "Permissions fixed successfully."

exec gosu "$APP_USER" "$@"
