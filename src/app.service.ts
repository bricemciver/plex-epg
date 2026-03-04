import { Injectable, Logger } from '@nestjs/common';
import { PlexService } from './plex.service';
import { channelGridKey, escapeXml, formatDate, toXmltvDate } from './utils';
import { createHash } from 'node:crypto';
import {
  PlexChannel,
  PlexGuideInfo,
  SchedulesDirectArtwork,
  SchedulesDirectProgram,
  SchedulesDirectSchedule,
  SchedulesDirectStation,
} from './types';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  constructor(private readonly plexService: PlexService) {}

  async buildGuideData(zipCode: string, days: number) {
    this.logger.log(`[INFO] Building guide data for zip ${zipCode}...`);

    // 1. Resolve OTA lineup UUID
    const lineupUuid = await this.plexService.getOtaLineupUuid(zipCode);

    // 2. Fetch channels for the OTA lineup
    const channels = await this.plexService.getChannels(lineupUuid);
    this.logger.log(`[INFO] OTA channels found: ${channels.length}`);
    if (!channels.length) {
      throw new Error('No channels found for OTA lineup.');
    }

    // 3. Guide grid — one request per channel per day for 14 days
    //    channelGridKey = part of channel.key after the '-'
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates = Array.from({ length: days }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return formatDate(d);
    });

    let allListings: PlexGuideInfo[] = [];
    let fetchCount = 0;
    const total = channels.length * dates.length;

    for (const ch of channels) {
      const gridKey = channelGridKey(ch.key);
      if (!gridKey) {
        this.logger.warn(
          `[WARN] Could not extract channelGridKey from key: ${ch.key}`,
        );
        continue;
      }
      for (const dateStr of dates) {
        try {
          const listings = await this.plexService.getGrid(gridKey, dateStr);
          // Tag each listing with the channel key so formatters can link them
          listings.forEach((l) => {
            l._channelKey = ch.key;
            l._channelVcn = ch.channelVcn;
          });
          allListings = allListings.concat(listings);
          fetchCount++;
          if (fetchCount % 10 === 0) {
            this.logger.log(
              `\r[INFO] Fetched ${fetchCount}/${total} grid pages...`,
            );
          }
        } catch (e) {
          this.logger.warn(
            `\n[WARN] Grid fetch failed for channel ${ch.callSign || ch.key} on ${dateStr}: ${e}`,
          );
        }
      }
    }
    this.logger.log(`\n[INFO] Total listings fetched: ${allListings.length}`);

    return { zipCode, channels, listings: allListings, fetchedAt: Date.now() };
  }

  /**
   * Produces a JSON structure loosely matching the Schedules Direct format:
   * {
   *   stations: [ { stationID, name, callsign, affiliate, broadcastLanguage, channel, logo } ],
   *   schedules: [ { stationID, programs: [ { programID, airDateTime, duration, md5 } ] } ],
   *   programs:  [ { programID, titles, descriptions, genres, originalAirDate, ... } ]
   * }
   */
  toSchedulesDirect({
    zipCode,
    channels,
    listings,
    fetchedAt,
  }: {
    zipCode: string;
    channels: PlexChannel[];
    listings: PlexGuideInfo[];
    fetchedAt: number;
  }) {
    const programMap: Record<string, SchedulesDirectProgram> = {};
    const scheduleMap: Record<
      string,
      {
        stationID: string;
        programs: SchedulesDirectSchedule[];
      }
    > = {};

    for (const item of listings) {
      const media = item.Media[0];
      const stationId = item._channelKey;
      const programId = item.ratingKey || item.guid;
      if (!stationId || !programId) continue;

      // ── Air time & duration ──────────────────────────────────────────────────
      // Media.beginsAt / endsAt are Unix epoch (seconds); duration is milliseconds
      const airDateTime = new Date(media.beginsAt * 1000).toISOString();
      const durationSecs = Math.floor((media.duration || 0) / 1000);
      const isNew = !!media.premiere;

      // ── Program record (de-duped by programId) ───────────────────────────────
      if (!programMap[programId]) {
        const isEpisode = item.type === 'episode';
        const isMovie = item.type === 'movie';

        // Image artwork — map Plex Image[].type to SD artwork roles
        const images = (item.Image || []).map<SchedulesDirectArtwork>(
          (img) => ({
            uri: img.url,
            size: 'Ms', // medium (SD convention; exact size unknown from Plex)
            aspect:
              img.type === 'background'
                ? '16x9'
                : img.type === 'coverSquare'
                  ? '1x1'
                  : '4x3',
            category:
              img.type === 'background'
                ? 'Banner'
                : img.type === 'clearLogo'
                  ? 'Logo'
                  : img.type === 'coverArt'
                    ? 'Iconic'
                    : img.type === 'coverPoster'
                      ? 'Poster'
                      : img.type === 'coverSquare'
                        ? 'Square'
                        : 'Banner',
            text: 'false',
            primary: img.type === 'coverPoster' ? 'true' : 'false',
          }),
        );

        const prog: SchedulesDirectProgram = {
          programID: programId,
          titles: [
            {
              title120:
                isEpisode && item.grandparentTitle
                  ? item.grandparentTitle
                  : item.title || '',
            },
          ],
          descriptions: item.summary
            ? {
                description1000: [
                  { description: item.summary, descriptionLanguage: 'en' },
                ],
              }
            : undefined,
          originalAirDate: item.originallyAvailableAt
            ? item.originallyAvailableAt.split('T')[0] // already ISO string
            : undefined,
          genres: (item.Genre || []).map((g) => g.tag),
          entityType: isEpisode ? 'Episode' : isMovie ? 'Movie' : 'Show',
          showType: isEpisode ? 'Series' : isMovie ? 'Feature Film' : 'Series',
          hasImageArtwork: images.length > 0,
          md5: createHash('md5')
            .update(item.guid || programId)
            .digest('hex'),
        };

        if (isEpisode) {
          prog.episodeTitle150 = item.title;
          prog.seriesId = item.grandparentRatingKey;
          if (item.parentIndex != null) prog.season = item.parentIndex;
          if (item.index != null) prog.episode = item.index;
        }

        if (item.contentRating) {
          prog.contentRating = [{ body: 'USA', code: item.contentRating }];
        }

        if (images.length) prog.artwork = { season: [], episode: images };

        // Remove undefined keys
        Object.keys(prog).forEach(
          (k) => prog[k] === undefined && delete prog[k],
        );
        programMap[programId] = prog;
      }

      // ── Schedule entry ───────────────────────────────────────────────────────
      if (!scheduleMap[stationId])
        scheduleMap[stationId] = { stationID: stationId, programs: [] };
      const schedEntry: SchedulesDirectSchedule = {
        programID: programId,
        airDateTime,
        duration: durationSecs,
        md5: programMap[programId].md5,
      };
      if (isNew) schedEntry.new = true;
      if (media.onAir) schedEntry.liveTapeDelay = 'Live';
      if (media.videoResolution) {
        schedEntry.videoProperties = [
          media.videoResolution === '1080' || media.videoResolution === '720'
            ? 'HDTV'
            : 'SDTV',
        ];
      }
      scheduleMap[stationId].programs.push(schedEntry);
    }

    // ── Stations ─────────────────────────────────────────────────────────────
    // Channel fields: { identifier, key, channelVcn, hd, thumb, title, callSign, language }
    const stations = channels.map((ch) => {
      const s: SchedulesDirectStation = {
        stationID: ch.key || ch.identifier || '',
        name: ch.title || ch.callSign || '',
        callsign: ch.callSign || ch.title || '',
        broadcastLanguage: [ch.language || 'en'],
        channel: ch.channelVcn || ch.identifier,
        isCommercialFree: false,
      };
      if (ch.hd)
        s.stationLogo = ch.thumb
          ? [
              {
                URL: ch.thumb,
                height: 270,
                width: 360,
                md5: '',
                category: 'Logo',
              },
            ]
          : undefined;
      if (!ch.hd)
        s.stationLogo = ch.thumb
          ? [
              {
                URL: ch.thumb,
                height: 270,
                width: 360,
                md5: '',
                category: 'Logo',
              },
            ]
          : undefined;
      if (ch.thumb)
        s.stationLogo = [
          { URL: ch.thumb, height: 270, width: 360, md5: '', category: 'Logo' },
        ];
      Object.keys(s).forEach((k) => s[k] === undefined && delete s[k]);
      return s;
    });

    return {
      serverID: 'plex-epg-server',
      datetime: new Date(fetchedAt).toISOString(),
      postalCode: zipCode,
      stations,
      schedules: Object.values(scheduleMap),
      programs: Object.values(programMap),
    };
  }

  toXMLTV({
    channels,
    listings,
  }: {
    channels: PlexChannel[];
    listings: PlexGuideInfo[];
  }) {
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE tv SYSTEM "xmltv.dtd">',
      '<tv source-info-name="Plex EPG Server" generator-info-name="plex-epg-server" generator-info-url="http://localhost">',
    ];

    // <channel> elements
    // Channel fields: { identifier, key, channelVcn, hd, thumb, title, callSign, language }
    for (const ch of channels) {
      const id = ch.key || ch.identifier || '';
      const name = escapeXml(ch.title || ch.callSign || id);
      const num = ch.channelVcn || ch.identifier;
      lines.push(`  <channel id="${escapeXml(id)}">`);
      lines.push(`    <display-name>${name}</display-name>`);
      if (ch.callSign)
        lines.push(
          `    <display-name>${escapeXml(ch.callSign)}</display-name>`,
        );
      if (num)
        lines.push(
          `    <display-name>${escapeXml(String(num))}</display-name>`,
        );
      if (ch.thumb) lines.push(`    <icon src="${escapeXml(ch.thumb)}" />`);
      lines.push(`  </channel>`);
    }

    // <programme> elements
    // Key field mappings from epg.provider.plex.tv/grid response:
    //   Media[0].beginsAt / endsAt       — Unix epoch seconds
    //   Media[0].duration                — milliseconds
    //   Media[0].premiere                — new episode flag
    //   Media[0].onAir                   — live broadcast flag
    //   originallyAvailableAt            — ISO date string "YYYY-MM-DDTHH:mm:ssZ"
    //   Genre[]                          — [{ tag }]
    //   Image[]                          — [{ type, url, alt }]
    //   grandparentTitle                 — show title when type === 'episode'
    //   title                            — episode/movie/show title
    for (const item of listings) {
      const media = item.Media[0];
      const stationId = item._channelKey;
      if (!stationId || !media.beginsAt) continue;

      const isEpisode = item.type === 'episode';
      const showTitle =
        isEpisode && item.grandparentTitle ? item.grandparentTitle : item.title;
      const epTitle = isEpisode ? item.title : null;

      // originallyAvailableAt is an ISO string — extract YYYYMMDD directly
      const origDate = item.originallyAvailableAt
        ? item.originallyAvailableAt.split('T')[0].replace(/-/g, '')
        : null;

      // Best poster: prefer coverPoster, fall back to coverArt
      const posterImg =
        (item.Image || []).find((i) => i.type === 'coverPoster') ||
        (item.Image || []).find((i) => i.type === 'coverArt');

      lines.push(
        `  <programme start="${toXmltvDate(media.beginsAt)}" stop="${toXmltvDate(media.endsAt)}" channel="${escapeXml(stationId)}">`,
      );

      // Title: show title for episodes, item.title for everything else
      lines.push(`    <title lang="en">${escapeXml(showTitle || '')}</title>`);

      // Sub-title: episode title
      if (epTitle)
        lines.push(
          `    <sub-title lang="en">${escapeXml(epTitle)}</sub-title>`,
        );

      // Description
      if (item.summary)
        lines.push(`    <desc lang="en">${escapeXml(item.summary)}</desc>`);

      // Original air date (YYYYMMDD)
      if (origDate) lines.push(`    <date>${origDate}</date>`);

      // Categories — one element per Genre entry
      for (const g of item.Genre || []) {
        lines.push(`    <category lang="en">${escapeXml(g.tag)}</category>`);
      }

      // Episode numbering: xmltv_ns is 0-based for both season and episode
      if (isEpisode && item.parentIndex != null && item.index != null) {
        lines.push(
          `    <episode-num system="xmltv_ns">${item.parentIndex - 1}.${item.index - 1}.0/1</episode-num>`,
        );
      }
      // Plex GUID as a secondary episode-num for clients that support it
      if (item.guid) {
        lines.push(
          `    <episode-num system="plex">${escapeXml(item.guid)}</episode-num>`,
        );
      }

      // Poster art (absolute URL from metadata-static.plex.tv — no auth needed)
      if (posterImg)
        lines.push(`    <icon src="${escapeXml(posterImg.url)}" />`);

      // Duration in seconds
      if (media.duration)
        lines.push(
          `    <length units="seconds">${Math.floor(media.duration / 1000)}</length>`,
        );

      // New / live flags from Media[0]
      if (media.premiere) lines.push(`    <new />`);
      if (media.onAir) lines.push(`    <live />`);

      // Content rating (VCHIP system for US broadcast)
      if (item.contentRating) {
        lines.push(
          `    <rating system="VCHIP"><value>${escapeXml(item.contentRating)}</value></rating>`,
        );
      }

      lines.push(`  </programme>`);
    }
    lines.push('</tv>');
    return lines.join('\n');
  }
}
