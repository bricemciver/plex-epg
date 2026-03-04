import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';
import { PlexGuideContainer, PlexLineups } from './types';

import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import rateLimit, { RateLimitedAxiosInstance } from 'axios-rate-limit';

@Injectable()
export class PlexService {
  private readonly logger = new Logger(PlexService.name);
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.rateLimitedHttp = rateLimit(this.httpService.axiosRef.create(), {
      limits: [
        { maxRequests: 5, duration: '2s' },
        { maxRequests: 2, duration: '500ms' },
        { maxRequests: 100, duration: '60s' },
      ],
    });
    this.PROVIDER = this.configService.get<string>(
      'PROVIDER',
      'tv.plex.providers.epg.cloud',
    );
    this.COUNTRY = this.configService.get<string>('COUNTRY', 'usa');
    this.PLEX_URL = this.configService.get<string>('PLEX_URL') ?? '';
  }

  PROVIDER = '';
  COUNTRY = '';
  PLEX_URL = '';
  rateLimitedHttp: RateLimitedAxiosInstance;

  async getOtaLineupUuid(postalCode: string) {
    const url = URL.parse(
      `/livetv/epg/countries/${this.COUNTRY}/${this.PROVIDER}/lineups?postalCode=${postalCode}`,
      this.PLEX_URL,
    )?.toString();
    if (!url) {
      throw Error('Invalid url');
    }
    // Clean URL
    const { data } = await firstValueFrom(
      this.httpService.get<PlexLineups>(url).pipe(
        catchError((error: AxiosError) => {
          this.logger.error(error.response?.data);
          throw error;
        }),
      ),
    );

    const container = data.MediaContainer;
    if (!container)
      throw new Error(
        'Unexpected response shape from /lineups — no MediaContainer',
      );

    this.logger.log(`[INFO] Lineup group uuid: ${container.uuid}`);

    const lineups = container.Lineup || [];
    if (!lineups.length)
      throw new Error(`No lineups returned for zip ${postalCode}`);

    // lineupType 0 = OTA
    const ota = lineups.find((l) => l.lineupType === 0);
    if (!ota) {
      const types = lineups
        .map((l) => `${l.title || l.uuid} (type=${l.lineupType})`)
        .join(', ');
      throw new Error(
        `No OTA lineup (lineupType=0) found. Available: ${types}`,
      );
    }

    this.logger.log(`[INFO] OTA lineup uuid: ${ota.uuid}`);
    return ota.uuid;
  }

  /**
   * Step 2: get channels for the OTA lineup uuid.
   *
   * Endpoint: GET /livetv/epg/lineupchannels?lineup={URIEncoded-lineupUuid}
   *
   * Response shape:
   *   { MediaContainer: { size, Lineup: [ { uuid, type, lineupType: -1, Channel: [...] } ] } }
   *
   * Each Channel object:
   *   { identifier, key, channelVcn, hd, thumb, title, callSign, language }
   */
  async getChannels(lineupUuid: string) {
    const url = URL.parse(
      `/livetv/epg/lineupchannels?lineup=${encodeURIComponent(lineupUuid)}`,
      this.PLEX_URL,
    )?.toString();
    if (!url) {
      throw Error('Invalid URL');
    }
    const { data } = await firstValueFrom(
      this.httpService.get<PlexLineups>(url).pipe(
        catchError((error: AxiosError) => {
          this.logger.error(error.response?.data);
          throw error;
        }),
      ),
    );

    const container = data.MediaContainer;
    if (!container) {
      throw new Error(
        'Unexpected response from /livetv/epg/lineupchannels — no MediaContainer',
      );
    }

    // Find the first Lineup entry that has channels
    const lineupEntry =
      (container.Lineup || []).find((l) => l.Channel) ||
      (container.Lineup || [])[0];
    if (!lineupEntry) {
      throw new Error('No Lineup entry found in lineupchannels response');
    }

    const channels = lineupEntry.Channel || [];
    this.logger.log(`[INFO] Channels in lineup: ${channels.length}`);
    return channels;
  }

  /**
   * Step 3: fetch one day of EPG grid data for a single channel from epg.provider.plex.tv.
   *
   * Endpoint: GET https://epg.provider.plex.tv/grid?channelGridKey={key}&date={YYYY-MM-DD}
   *
   * channelGridKey is the portion of the channel's key field AFTER the '-'.
   * e.g. key "5fc76c6ac8d56d002e1fa824-5fc705f5c8d56d002e06f81b"
   *   → channelGridKey "5fc705f5c8d56d002e06f81b"
   *
   * The grid endpoint is external (epg.provider.plex.tv), not the local PMS,
   * but still requires the X-Plex-Token header.
   */
  async getGrid(channelGridKey: string, dateStr: string) {
    // Check the cache first to avoid unnecessary calls to Plex EPG
    const cacheKey = `channelGridKey=${encodeURIComponent(channelGridKey)}&date=${encodeURIComponent(dateStr)}`;
    let guideData = await this.cacheManager.get<PlexGuideContainer>(cacheKey);
    if (!guideData) {
      const response = await this.rateLimitedHttp.get<PlexGuideContainer>(
        `https://epg.provider.plex.tv/grid?${cacheKey}`,
      );
      if (response.data.MediaContainer.Metadata) {
        // 28,800,000 is 8 hours in milliseconds
        guideData = await this.cacheManager.set<PlexGuideContainer>(
          cacheKey,
          response.data,
          28800000,
        );
      }
    }
    return guideData?.MediaContainer.Metadata || [];
  }
}
