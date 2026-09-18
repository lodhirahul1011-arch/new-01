const BLOCKED_SDP_LINES = new Set(['a=extmap-allow-mixed']);

export function normalizeWebRtcSdp(rawSdp?: string | null) {
  const normalizedLines = String(rawSdp || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0)
    .filter(line => !BLOCKED_SDP_LINES.has(line));

  if (!normalizedLines.length) {
    return '';
  }

  return `${normalizedLines.join('\r\n')}\r\n`;
}
