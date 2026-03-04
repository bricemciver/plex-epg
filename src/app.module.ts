/* eslint-disable @typescript-eslint/require-await */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import * as Joi from 'joi';
import { PlexService } from './plex.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        PROVIDER: Joi.string().default('tv.plex.providers.epg.cloud'),
        COUNTRY: Joi.string().default('usa'),
        ZIP_CODE: Joi.string().default('66219'),
        PLEX_TOKEN: Joi.string().required(),
        PLEX_URL: Joi.string().uri().required(),
        PORT: Joi.number().port().default(3000),
      }),
    }),
    CacheModule.register(),
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': configService.get<string>('PLEX_TOKEN'),
          'x-plex-provider-version': '5.1',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [AppService, PlexService],
})
export class AppModule {}
