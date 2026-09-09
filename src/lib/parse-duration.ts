/** Parse a duration like `45`, `45m`, `1h 15`, `1:15`, or `1.5h` into seconds. */
export function parseDurationToSeconds(raw: string): number | null {
  const value = raw.trim().toLowerCase().replace(/,/g, ".");
  if (!value) return null;

  const colon = value.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (colon) {
    const total =
      Number(colon[1]) * 3600 +
      Number(colon[2]) * 60 +
      Number(colon[3] ?? 0);
    return total > 0 ? total : null;
  }

  if (/^\d+(\.\d+)?$/.test(value)) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return Math.round(minutes * 60);
  }

  const normalized = value
    .replace(/hours?|hrs?/g, "h")
    .replace(/minutes?|mins?/g, "m")
    .replace(/seconds?|secs?/g, "s");

  const hoursMatch = normalized.match(/(\d+(?:\.\d+)?)\s*h/);
  const minutesMatch = normalized.match(/(\d+(?:\.\d+)?)\s*m/);
  const secondsMatch = normalized.match(/(\d+(?:\.\d+)?)\s*s/);
  const hoursThenNumber = normalized.match(
    /h\s+(\d+(?:\.\d+)?)\s*$/,
  );

  const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
  const minutes = minutesMatch
    ? Number(minutesMatch[1])
    : hoursThenNumber && !minutesMatch
      ? Number(hoursThenNumber[1])
      : 0;
  const seconds = secondsMatch ? Number(secondsMatch[1]) : 0;

  if (!hoursMatch && !minutesMatch && !secondsMatch && !hoursThenNumber) {
    return null;
  }

  const total = Math.round(hours * 3600 + minutes * 60 + seconds);
  return total > 0 ? total : null;
}
