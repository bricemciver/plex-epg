import {
  formatDate,
  channelGridKey,
  escapeXml,
  toXmltvDate,
} from '../src/utils';

describe('utils.formatDate', () => {
  it('should format a date as YYYY-MM-DD', () => {
    const date = new Date('2023-01-01');
    expect(formatDate(date)).toBe('2023-01-01');
  });

  it('should pad single-digit months', () => {
    const date = new Date('2023-03-05');
    expect(formatDate(date)).toBe('2023-03-05');
  });

  it('should pad single-digit days', () => {
    const date = new Date('2023-12-09');
    expect(formatDate(date)).toBe('2023-12-09');
  });
});

describe('utils.channelGridKey', () => {
  it('should extract key after hyphen', () => {
    expect(channelGridKey('abc-123')).toBe('123');
  });

  it('should return key if no hyphen', () => {
    expect(channelGridKey('abc123')).toBe('abc123');
  });

  it('should return null for empty input', () => {
    expect(channelGridKey('')).toBeNull();
  });
});

describe('utils.escapeXml', () => {
  it('should escape &', () => {
    expect(escapeXml('&')).toBe('&amp;');
  });

  it('should escape <', () => {
    expect(escapeXml('<')).toBe('&lt;');
  });

  it('should escape >', () => {
    expect(escapeXml('>')).toBe('&gt;');
  });

  it('should escape "', () => {
    expect(escapeXml('"')).toBe('&quot;');
  });

  it('should escape single quote', () => {
    expect(escapeXml("'")).toBe('&apos;');
  });

  it('should handle null input', () => {
    expect(escapeXml(null)).toBe('');
  });

  it('should handle undefined input', () => {
    expect(escapeXml(undefined)).toBe('');
  });

  it('should handle empty string', () => {
    expect(escapeXml('')).toBe('');
  });

  it('should escape multiple special characters', () => {
    expect(escapeXml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;');
  });
});

describe('utils.toXmltvDate', () => {
  it('should format ISO date string', () => {
    expect(toXmltvDate('2023-01-01T12:34:56Z')).toBe('20230101123456 +0000');
  });

  it('should format epoch timestamp', () => {
    expect(toXmltvDate(1672531200)).toBe('20230101000000 +0000');
  });

  it('should handle single-digit values', () => {
    expect(toXmltvDate('2023-03-05T01:02:03Z')).toBe('20230305010203 +0000');
  });

  it('should handle leap year', () => {
    expect(toXmltvDate('2024-02-29T12:00:00Z')).toBe('20240229120000 +0000');
  });

  it('should handle midnight', () => {
    expect(toXmltvDate('2023-12-31T00:00:00Z')).toBe('20231231000000 +0000');
  });
});
