import { getLocalTimeZone, parseDate, today, type CalendarDate } from '@internationalized/date';

const formatDateOnlyForDateField = (date: CalendarDate) => date.toString();

const getSlashDateFieldDate = (value: string) => {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = parseDate(`${year.toString().padStart(4, '0')}-01-01`).set({ month, day });

  return date.year === year && date.month === month && date.day === day ? date : null;
};

const getDateFieldSelectedDate = (value: string) => {
  if (!value) return null;

  try {
    return parseDate(value);
  } catch {
    return getSlashDateFieldDate(value);
  }
};

const getDateFieldFocusedDate = (
  value: string,
  fallback: CalendarDate = today(getLocalTimeZone())
) => getDateFieldSelectedDate(value) ?? fallback;

const normalizeDateFieldInput = (value: string) => {
  const date = getDateFieldSelectedDate(value);

  return date ? formatDateOnlyForDateField(date) : value;
};

export {
  formatDateOnlyForDateField,
  getDateFieldFocusedDate,
  getDateFieldSelectedDate,
  normalizeDateFieldInput,
};
