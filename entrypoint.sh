#!/bin/sh
# entrypoint.sh
#
# Generates channels.xml from Plex OTA data, then starts the upstream
# EPG image via pm2-runtime.
#
# If ZIP_CODE is not set, channels.xml generation is skipped and the
# image behaves exactly like the upstream.

set -e

CHANNELS_FILE="${CHANNELS_FILE:-/epg/public/channels.xml}"

if [ -n "$ZIP_CODE" ]; then
  echo "=== OTA channel generation enabled for zip: $ZIP_CODE ==="

  node /ota/generate-channels.js \
    --zip="$ZIP_CODE" \
    --output="$CHANNELS_FILE" \
    --lang="${OTA_LANG:-en}"

  echo "=== Channel generation complete ==="
else
  echo "ZIP_CODE not set — skipping OTA channel generation."
fi

# Hand off to the upstream CMD (pm2-runtime pm2.config.js)
exec "$@"
