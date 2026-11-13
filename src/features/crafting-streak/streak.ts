/** Saved dates are calendar labels, including PocketBase's midnight transport format. */
export function savedDay(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/.exec(value);
  if (!match) return null;
  const label = match[1];
  const date = new Date(`${label}T12:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === label
    ? label
    : null;
}

export function craftingStreak(dates: string[], now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const days = new Set(dates);
  const cursor = new Date(`${today}T12:00:00Z`);
  const label = () => cursor.toISOString().slice(0, 10);
  const previous = () => cursor.setUTCDate(cursor.getUTCDate() - 1);
  if (!days.has(label())) previous();
  let count = 0;
  while (days.has(label())) {
    count += 1;
    previous();
  }
  return count;
}
