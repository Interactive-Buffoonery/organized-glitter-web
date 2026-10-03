const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

const shortMonthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC',
});

export function editorialDate(value) {
  const parts =
    typeof value === 'string'
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value)
      : null;
  if (!parts) throw new Error('WordPress post has invalid date');

  const [, year, month, day, hour, minute, second] = parts.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    year < 1000 ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  ) {
    throw new Error('WordPress post has invalid date');
  }
  return value.slice(0, 10);
}

export function formatEditorialDate(value) {
  return dateFormat.format(new Date(`${value}T00:00:00Z`));
}

export function formatFeaturedDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  const month = shortMonthFormat.format(date);
  const day = date.getUTCDate();
  const suffix =
    day % 100 >= 11 && day % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][day % 10] || 'th';
  return `${month === 'Sep' ? 'Sept' : month} ${day}${suffix}`;
}
