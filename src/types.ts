export type PlexChannel = {
  identifier: string;
  key: string;
  channelVcn: string;
  hd: boolean;
  thumb: string;
  title: string;
  callSign: string;
  language: string;
};

export type PlexLineup = {
  uuid: string;
  type: string;
  title?: string;
  lineupType: number;
  Channel?: PlexChannel[];
};

export type PlexLineups = {
  MediaContainer: {
    size: number;
    uuid?: string;
    Lineup: PlexLineup[];
  };
};

export type PlexGuideImage = {
  alt: string;
  type: string;
  url: string;
};

export type PlexGuideGenre = {
  filter: string;
  id: string;
  key: string;
  ratingKey: string;
  slug: string;
  tag: string;
  type: string;
  context: string;
};

export type PlexGuideMedia = {
  beginsAt: number;
  duration: number;
  endsAt: number;
  id: string;
  onAir: boolean;
  premiere: boolean;
  videoResolution: string;
  origin: string;
};

export type PlexGuideInfo = {
  guid: string;
  key: string;
  ratingKey: string;
  summary: string;
  type: string;
  addedAt: number;
  contentRating: string;
  duration: number;
  grandparentArt: string;
  grandparentGuid: string;
  grandparentKey: string;
  grandparentRatingKey: string;
  grandparentThumb: string;
  grandparentTitle: string;
  grandparentType: string;
  index: number;
  originallyAvailableAt: string;
  parentIndex: number;
  skipParent: boolean;
  title: string;
  userState: boolean;
  year: number;
  Image: PlexGuideImage[];
  Genre: PlexGuideGenre[];
  Media: PlexGuideMedia[];
  _channelKey?: string;
  _channelVcn?: string;
};

export type PlexGuideContainer = {
  MediaContainer: {
    offset: number;
    totalSize: number;
    identifier: string;
    size: number;
    Metadata: PlexGuideInfo[];
  };
};

export type SchedulesDirectArtwork = {
  uri: string;
  size: string;
  aspect: string;
  category: string;
  text: string;
  primary: string;
};

export type SchedulesDirectProgram = {
  programID: string;
  titles: {
    title120: string;
  }[];
  descriptions?: {
    description1000: {
      description: string;
      descriptionLanguage: string;
    }[];
  };
  originalAirDate?: string;
  genres: string[];
  entityType: string;
  showType: string;
  hasImageArtwork: boolean;
  md5: string;
  episodeTitle150?: string;
  seriesId?: string;
  season?: number;
  episode?: number;
  contentRating?: [{ body: string; code: string }];
  artwork?: {
    season: [];
    episode: SchedulesDirectArtwork[];
  };
};

export type SchedulesDirectSchedule = {
  programID: string;
  airDateTime: string;
  duration: number;
  md5: string;
  new?: boolean;
  liveTapeDelay?: string;
  videoProperties?: string[];
};

export type SchedulesDirectStation = {
  stationID: string;
  name: string;
  callsign: string;
  broadcastLanguage: string[];
  channel: string;
  isCommercialFree: boolean;
  stationLogo?: [
    {
      URL: string;
      height: number;
      width: number;
      md5: string;
      category: string;
    },
  ];
};
