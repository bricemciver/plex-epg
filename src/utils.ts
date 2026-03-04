/** Format a Date as YYYY-MM-DD */
function formatDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Extract channelGridKey from a channel key: the part after the '-' */
function channelGridKey(channelKey: string) {
  if (!channelKey) {
    return null;
  }
  const idx = channelKey.indexOf('-');
  return idx !== -1 ? channelKey.slice(idx + 1) : channelKey;
}

function escapeXml(str: string) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toXmltvDate(isoOrEpoch: string | number) {
  const d =
    typeof isoOrEpoch === 'number'
      ? new Date(isoOrEpoch * 1000)
      : new Date(isoOrEpoch);
  // XMLTV format: YYYYMMDDHHmmss +0000
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`
  );
}

export { channelGridKey, escapeXml, formatDate, toXmltvDate };
