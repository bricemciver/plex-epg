import {
  Controller,
  Get,
  Header,
  Req,
  Inject,
  UseInterceptors,
} from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { CACHE_MANAGER, Cache, CacheInterceptor } from '@nestjs/cache-manager';
import { PlexChannel, PlexGuideInfo } from './types';
import { formatDate } from './utils';

@Controller()
export class AppController {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly appService: AppService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  getIndex(): string {
    return `<!DOCTYPE html>
    <html><head><title>Plex EPG Server</title></head><body>
    <h2>Plex EPG Server</h2>
    <ul>
    <li><a href="/guide.json">GET /guide.json</a> — Schedules Direct JSON</li>
    <li><a href="/guide.xml">GET /guide.xml</a> — XMLTV format</li>
    </ul>
    </body></html>`;
  }

  async getGuideDataSetup(req: Request): Promise<{
    zipCode: string;
    channels: PlexChannel[];
    listings: PlexGuideInfo[];
    fetchedAt: number;
  }> {
    const zipCode =
      typeof req.query.zip === 'string'
        ? req.query.zip
        : this.configService.get<string>('ZIP_CODE', '66219');
    const qsDays = req.query.days ?? this.configService.get('DAYS', '2');
    const days = Math.min(14, Math.max(Number(qsDays), 1));
    const cacheKey = `zip=${zipCode}&start=${formatDate(new Date())}&days=${days}`;
    let data = await this.cacheManager.get<{
      zipCode: string;
      channels: PlexChannel[];
      listings: PlexGuideInfo[];
      fetchedAt: number;
    }>(cacheKey);
    if (data) {
      return data;
    }
    data = await this.appService.buildGuideData(zipCode, days);
    await this.cacheManager.set(cacheKey, data);
    return data;
  }

  @Get('/guide.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @UseInterceptors(CacheInterceptor)
  async getXmlGuide(@Req() req: Request): Promise<string> {
    const guideData = await this.getGuideDataSetup(req);
    return this.appService.toXMLTV(guideData);
  }

  @Get('/guide.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @UseInterceptors(CacheInterceptor)
  async getJsonGuide(@Req() req: Request): Promise<string> {
    const guideData = await this.getGuideDataSetup(req);
    const output = this.appService.toSchedulesDirect(guideData);
    return JSON.stringify(output, null, 2);
  }
}
