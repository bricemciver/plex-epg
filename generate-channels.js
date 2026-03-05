#!/usr/bin/env node
/**
 * generate-channels.js
 *
 * Fetches OTA TV stations for a zip code via the Plex Pass Live TV EPG API,
 * matches them against the iptv-org channel database by callsign, and writes
 * a channels.xml suitable for use with ghcr.io/iptv-org/epg:master.
 *
 * Matching strategy:
 *   1. Try `${callsign}.us` against iptv-org channel IDs
 *   2. Try `${callsign}1.us` (iptv-org sometimes appends "1" for primary subchannels)
 *   Unmatched channels are included with xmltv_id="" so the grabber can still
 *   attempt a lookup via site_id.
 *
 * Usage:
 *   node generate-channels.js --zip=<ZIP> [options]
 *
 * Required environment variables:
 *   PLEX_URL    Base URL of your local Plex server, e.g. http://192.168.1.10:32400
 *   PLEX_TOKEN  Your Plex authentication token (X-Plex-Token)
 *
 * Options:
 *   --zip     US zip code (required)
 *   --output  Output path for channels.xml (default: /epg/public/channels.xml)
 *   --lang    Fallback language code when Plex does not supply one (default: en)
 */

"use strict";

const https = require("https");
const http  = require("http");
const fs    = require("fs");
const path  = require("path");

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [key, val] = arg.replace(/^--/, "").split("=");
    args[key] = val !== undefined ? val : true;
  }
  return args;
}

const args = parseArgs();

if (!args.zip) {
  console.error("ERROR: --zip is required.\n  Usage: node generate-channels.js --zip=90210");
  process.exit(1);
}

const PLEX_URL   = process.env.PLEX_URL?.replace(/\/$/, "");
const PLEX_TOKEN = process.env.PLEX_TOKEN;

if (!PLEX_URL || !PLEX_TOKEN) {
  console.error("ERROR: PLEX_URL and PLEX_TOKEN environment variables are required.");
  process.exit(1);
}

const ZIP      = String(args.zip).trim();
const OUTPUT   = args.output || "/epg/public/channels.xml";
const EPG_SITE = "plex.tv";
const LANG     = args.lang || "en";

// ── HTTP helper ───────────────────────────────────────────────────────────────

function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, { headers: { "Accept": "application/json", ...headers } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(fetchJSON(res.headers.location, headers));
        } else if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}\n${data}`));
        } else {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Invalid JSON from ${url}: ${e.message}`)); }
        }
      });
    }).on("error", reject);
  });
}

// ── Step 1: Find the OTA lineup UUID ─────────────────────────────────────────

async function fetchOTALineupUUID(zip) {
  console.log(`[1/3] Fetching Plex lineups for zip ${zip}...`);

  const url = `${PLEX_URL}/livetv/epg/countries/usa/tv.plex.providers.epg.cloud/lineups` +
              `?postalCode=${zip}`;
  const json = await fetchJSON(url, { "X-Plex-Token": PLEX_TOKEN });

  const lineups = json?.MediaContainer?.Lineup ?? [];
  if (!lineups.length) {
    throw new Error(`No lineups returned for zip ${zip}. Check PLEX_URL and PLEX_TOKEN.`);
  }

  const ota = lineups.find((l) => l.lineupType === 0);
  if (!ota) {
    const types = lineups.map((l) => `"${l.title}" (type ${l.lineupType})`).join(", ");
    throw new Error(`No OTA lineup found for zip ${zip}. Available: ${types}`);
  }

  console.log(`    -> Found OTA lineup: "${ota.title}"`);
  console.log(`    -> UUID: ${ota.uuid}`);
  return ota.uuid;
}

// ── Step 2: Fetch channels ────────────────────────────────────────────────────

async function fetchPlexChannels(lineupUUID) {
  console.log(`[2/3] Fetching channels for OTA lineup...`);

  const url = `${PLEX_URL}/livetv/epg/lineupchannels` +
              `?lineup=${encodeURIComponent(lineupUUID)}`;
  const json = await fetchJSON(url, { "X-Plex-Token": PLEX_TOKEN });

  const rawChs = json?.MediaContainer?.Lineup?.[0]?.Channel ?? [];
  if (!rawChs.length) {
    throw new Error("No channels returned from Plex for this lineup.");
  }

  const stations = rawChs.map((ch) => ({
    callsign:   ch.callSign   ?? "",
    title:      ch.title      ?? "",
    language:   ch.language   ?? "",
    channelVcn: ch.channelVcn ?? ch.identifier ?? "",
    key:        ch.key        ?? "",
  }));

  console.log(`    -> ${stations.length} channels`);
  return stations;
}

// ── Step 3: Build iptv-org ID index ──────────────────────────────────────────

async function buildIdIndex() {
  console.log(`[3/3] Fetching iptv-org channel database...`);
  const channels = await fetchJSON("https://iptv-org.github.io/api/channels.json");
  console.log(`    -> ${channels.length} channels in database`);

  const byId = {};
  for (const ch of channels) {
    if (ch.id) byId[ch.id.toLowerCase()] = ch.id;
  }
  return byId;
}

// ── Callsign helpers ──────────────────────────────────────────────────────────

function normaliseCallsign(str) {
  // Strip hyphenated suffixes (-DT, -LD, -TV) but leave bare callsigns intact
  // e.g. "WDAF-DT" -> "WDAF", "WDAFDT" stays "WDAFDT"
  return (str ?? "").replace(/-(DT|LD|TV)$/i, "").toUpperCase();
}

function lookupXmltvId(callsign, byId) {
  const cs = normaliseCallsign(callsign);
  if (!cs) return null;
  return byId[`${cs.toLowerCase()}.us`]
      ?? byId[`${cs.toLowerCase()}1.us`]
      ?? null;
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function escapeXml(str) {
  return (str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function padVcn(vcn) {
  // Zero-pad major part only: "4.1" -> "04.1", "19.1" -> "19.1"
  const [major, ...rest] = String(vcn ?? "").split(".");
  const padded = major.padStart(2, "0");
  return rest.length ? `${padded}.${rest.join(".")}` : padded;
}

function formatChannelName(vcn, callSign, title) {
  const parts = [];
  if (vcn)      parts.push(padVcn(vcn));
  if (callSign) parts.push(`(${callSign})`);
  if (title)    parts.push(title);
  return parts.join(" ");
}

// ── Build channels.xml ────────────────────────────────────────────────────────

function buildChannelsXml(stations, byId, site, lang) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<channels>",
    `  <!-- Generated by epg-ota-generator (Plex) for zip ${ZIP} -->`,
    `  <!-- ${new Date().toISOString()} -->`,
  ];

  let matched   = 0;
  let unmatched = 0;

  for (const st of stations) {
    const xmltvId    = lookupXmltvId(st.callsign, byId) ?? "";
    const displayName = formatChannelName(st.channelVcn, st.callsign, st.title);
    const siteId     = st.key || normaliseCallsign(st.callsign);
    const chLang     = st.language || lang;

    lines.push(
      `  <channel site="${site}" site_id="${escapeXml(siteId)}" lang="${chLang}" xmltv_id="${xmltvId}"` +
      `>${escapeXml(displayName)}</channel>`
    );

    if (xmltvId) matched++; else unmatched++;
  }

  lines.push("</channels>", "");
  console.log(`    -> ${matched} matched, ${unmatched} unmatched (xmltv_id="")`);
  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== EPG OTA Channel Generator (Plex) ===");
  console.log(`Zip: ${ZIP} | Plex: ${PLEX_URL} | Site: ${EPG_SITE}`);
  console.log();

  const lineupUUID = await fetchOTALineupUUID(ZIP);
  const stations   = await fetchPlexChannels(lineupUUID);
  const byId       = await buildIdIndex();

  console.log();
  console.log("Building channels.xml...");
  const xml = buildChannelsXml(stations, byId, EPG_SITE, LANG);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, xml, "utf8");

  console.log();
  console.log(`Wrote ${OUTPUT}`);
  console.log("  The EPG grabber will now use this file to fetch program data.");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
