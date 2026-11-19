export type WeekDayStatus = 'activity' | 'marked' | 'none';

export interface DayMark {
  id: string;
  day: string;
}

export interface WeekDay {
  day: string;
  status: WeekDayStatus;
  isToday: boolean;
  markId?: string;
}

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

function localDay(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Activity slots are UTC instants; the streak counts them on the user's local day. */
export function slotDay(slot: string, timeZone: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)Z$/.exec(slot);
  if (!match) return null;
  const instant = new Date(`${match[1]}T${match[2]}Z`);
  return Number.isFinite(instant.valueOf()) ? localDay(instant, timeZone) : null;
}

function shiftDay(day: string, offset: number): string {
  const cursor = new Date(`${day}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + offset);
  return cursor.toISOString().slice(0, 10);
}

export function craftingStreak(dates: string[], now: Date, timeZone: string): number {
  const days = new Set(dates.filter(date => savedDay(date) === date));
  let cursor = localDay(now, timeZone);
  if (!days.has(cursor)) cursor = shiftDay(cursor, -1);
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = shiftDay(cursor, -1);
  }
  return count;
}

export function craftingWeek(
  { activityDays, marks }: { activityDays: string[]; marks: DayMark[] },
  now: Date,
  timeZone: string
): WeekDay[] {
  const today = localDay(now, timeZone);
  const active = new Set(activityDays);
  const marked = new Map(marks.map(mark => [mark.day, mark.id]));
  return Array.from({ length: 7 }, (_, index): WeekDay => {
    const day = shiftDay(today, index - 6);
    const isToday = index === 6;
    if (active.has(day)) return { day, status: 'activity', isToday };
    const markId = marked.get(day);
    return markId ? { day, status: 'marked', isToday, markId } : { day, status: 'none', isToday };
  });
}
