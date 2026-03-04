# Plex EPG Server

## Description
A NestJS-based EPG server that converts Plex TV guide data into Schedules Direct JSON and XMLTV formats for use with media center applications.

## Features
- Converts Plex TV guide data to Schedules Direct JSON and XMLTV formats
- Caching of EPG data for improved performance
- Supports custom ZIP code configuration
- Live TV detection and recording flags
- Content rating support (VCHIP)
- Channel logo/artwork integration
- Date/time formatting for XMLTV compliance

## Installation
```bash
$ npm install
$ npm start
```

## Configuration
Set environment variables in `.env`:
```env
PLEX_TOKEN=your_plex_token
PLEX_URL=https://your-plex-server:32400
ZIP_CODE=66219  # Default: 66219 (Kansas City)
PORT=3000        # Default: 3000
DAYS=2           # Default: 2 days of EPG data
```

## API Endpoints
- `GET /guide.json` - Returns Schedules Direct JSON format
- `GET /guide.xml` - Returns XMLTV format
- `GET /refresh` - Clears cache and forces data refresh

## Usage
1. Start the server
2. Access endpoints:
   - `http://localhost:3000/guide.json`
   - `http://localhost:3000/guide.xml`
3. Configure Plex server settings in `.env`

## License
MIT License - see [LICENSE](LICENSE) file for details
