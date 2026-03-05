# EPG OTA Extension

Extends [`ghcr.io/iptv-org/epg:master`](https://github.com/iptv-org/epg) with automatic
**over-the-air (OTA) channel discovery** using the Plex Pass Live TV EPG API.

Instead of manually crafting a `channels.xml`, you supply a zip code and your Plex server
details. The image queries Plex for local broadcast stations, generates `channels.xml`,
and then runs the upstream EPG grabber normally.

---

## How it works

```
┌──────────────────────────────────────────────────────────────────┐
│  Extended EPG container (this image)                              │
│                                                                   │
│  1. generate-channels.js                                          │
│     a. GET /livetv/epg/.../lineups?postalCode=ZIP                 │
│           -> find the lineupType=0 (OTA/broadcast) entry          │
│     b. GET /livetv/epg/lineupchannels?lineup=<uuid>               │
│           -> get all channels (callSign, title, key, ...)         │
│     c. Match callsigns to xmltv_ids via iptv-org channel DB       │
│     d. Write /epg/public/channels.xml                             │
│                                                                   │
│  2. exec upstream entrypoint.sh                                   │
│     -> EPG grabber runs as normal                                 │
│     -> guide.xml served at :3000/guide.xml                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Quick start

### With Docker Compose (recommended)

```yaml
# docker-compose.yml
services:
  plex-epg:
    build: .
    ports:
      - "3000:3000"
    environment:
      ZIP_CODE: "90210"
      PLEX_URL: "http://192.168.1.10:32400"
      PLEX_TOKEN: "your-plex-token-here"
      TZ: "America/Los_Angeles"
      CRON_SCHEDULE: "0 3 * * *"
```

```bash
docker compose up -d
# Guide available at http://localhost:3000/guide.xml
```

### With plain Docker

```bash
# Build
docker build -t plex-epg .

# Run
docker run -p 3000:3000 \
  -e ZIP_CODE=90210 \
  -e PLEX_URL=http://192.168.1.10:32400 \
  -e PLEX_TOKEN=your-plex-token-here \
  plex-epg

```

### With Makefile

```bash
# Build
make build

# Run
make run

# Enter running container
make exec

# Stop container
make stop

# Remove image
make clean
```

---

## Finding your Plex token

In the Plex web app, play any item, then open **Settings → Troubleshooting → Download logs**.
The token appears in the URL as `X-Plex-Token=...`. Alternatively see the
[official Plex support article](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/).

---

## Environment variables

### OTA extension variables

| Variable        | Default                    | Description                                                 |
|-----------------|----------------------------|-------------------------------------------------------------|
| `ZIP_CODE`      | *(unset)*                  | US zip code. **Required** to enable OTA channel generation. |
| `PLEX_URL`      | *(unset)*                  | Base URL of your local Plex server. **Required.**           |
| `PLEX_TOKEN`    | *(unset)*                  | Your `X-Plex-Token`. **Required.**                          |
| `OTA_LANG`      | `en`                       | Fallback language tag for channels where Plex does not supply one. |
| `CHANNELS_FILE` | `/epg/public/channels.xml` | Output path for the generated channels file.                |

### Original upstream variables (unchanged)

| Variable          | Default     | Description                          |
|-------------------|-------------|--------------------------------------|
| `CRON_SCHEDULE`   | `0 0 * * *` | Cron expression for guide refresh.   |
| `MAX_CONNECTIONS` | `5`         | Parallel grabber connections.        |
| `GZIP`            | `false`     | Also produce `guide.xml.gz`.         |
| `DAYS`            | `7`         | Number of days of guide data.        |
| `TIMEOUT`         | `5`         | Per-request timeout (seconds).       |
| `DELAY`           | `0`         | Delay between requests (seconds).    |
| `TZ`              | `UTC`       | Container timezone.                  |

---

## Channel names

Channels are named in the format `{vcn} ({callSign}) {title}`, e.g.:

```
04.1 (WDAFDT) FOX
04.2 (WDAFDT2) Antenna TV
09.1 (KMBC) ABC
19.1 (KCPT) PBS
```

The major channel number is zero-padded so that the list sorts correctly
(e.g. `04.1` sorts before `19.1`).

---

## Channel matching

Each Plex channel is matched to an `xmltv_id` using the
[iptv-org channel database](https://github.com/iptv-org/database) by callsign:

1. Try `{callsign}.us` against iptv-org channel IDs
2. Try `{callsign}1.us` — iptv-org sometimes appends `1` for primary subchannels
   (e.g. `KMBC.us` vs `KMBC1.us`)

Hyphenated suffixes (`-DT`, `-LD`, `-TV`) are stripped before matching, but bare
callsigns like `WDAFDT` are left intact.

Channels with no match are still included in `channels.xml` with `xmltv_id=""` so
the EPG grabber can attempt a lookup via `site_id`.

---

## Regenerating channels manually

```bash
docker exec <container_name> node /ota/generate-channels.js \
  --zip=10001 \
  --output=/epg/public/channels.xml
```

---

## Inspecting the generated channels.xml

```bash
# Via docker exec
docker exec <container_name> cat /epg/public/channels.xml
```

---

## Troubleshooting

**"No lineups returned"** — Verify `PLEX_URL` is reachable from inside the container
(use the LAN IP, not `localhost`) and that `PLEX_TOKEN` is valid.

**"No OTA lineup found"** — Plex will list what lineups it did find in the error message.
If only cable/satellite lineups appear, your Plex server may need Live TV configured, or
the zip code may not have OTA data in the Plex EPG database.

**Many unmatched channels** — Subchannels and low-power stations may not be in the
iptv-org database. They will still appear in `channels.xml` with `xmltv_id=""`.

**Wrong timezone** — Set `TZ` to your IANA timezone (e.g. `America/Chicago`).
