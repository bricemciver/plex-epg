# Dockerfile
#
# Extends ghcr.io/iptv-org/epg:master with automatic OTA channel discovery.
#
# New environment variables:
#   ZIP_CODE         US zip code — triggers OTA channel generation at startup.
#                    If unset the image behaves exactly like the upstream.
#   PLEX_URL         Base URL of your local Plex server (e.g. http://192.168.1.10:32400).
#   PLEX_TOKEN       Your Plex authentication token (X-Plex-Token).
#   OTA_LANG         Fallback language tag for channels where Plex does not supply one (default: en).
#   CHANNELS_FILE    Output path for channels.xml (default: /epg/public/channels.xml).
#
# All original upstream env vars (CRON_SCHEDULE, MAX_CONNECTIONS, GZIP, DAYS, etc.)
# continue to work unchanged.
#
# Usage example:
#
#   docker run -p 3000:3000 \
#     -e ZIP_CODE=90210 \
#     -e PLEX_URL=http://192.168.1.10:32400 \
#     -e PLEX_TOKEN=your-token-here \
#     epg-ota

FROM ghcr.io/iptv-org/epg:master

# Copy our OTA extension files into a dedicated directory
RUN mkdir -p /ota
COPY generate-channels.js /ota/generate-channels.js
COPY entrypoint.sh        /ota/entrypoint.sh
RUN chmod +x /ota/entrypoint.sh

# Wrap the upstream CMD. Our script generates channels.xml then
# execs "$@", which passes through to the upstream CMD (pm2-runtime pm2.config.js).
ENTRYPOINT ["/ota/entrypoint.sh"]
CMD ["pm2-runtime", "pm2.config.js"]
