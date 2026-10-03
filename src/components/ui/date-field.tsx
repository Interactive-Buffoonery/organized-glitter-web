import * as React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button as AriaButton } from 'react-aria-components/Button';
import {
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
} from 'react-aria-components/Calendar';
import type { CalendarDate } from '@internationalized/date';

import { Button } from '@/components/ui/button';
import {
  formatDateOnlyForDateField,
  getDateFieldFocusedDate,
  getDateFieldSelectedDate,
  normalizeDateFieldInput,
} from '@/components/ui/date-field-utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type CalendarPlacement = 'popover' | 'inline';

const MONTH_OPTIONS = [
  { value: '1', label: 'January', abbreviation: 'Jan' },
  { value: '2', label: 'February', abbreviation: 'Feb' },
  { value: '3', label: 'March', abbreviation: 'Mar' },
  { value: '4', label: 'April', abbreviation: 'Apr' },
  { value: '5', label: 'May', abbreviation: 'May' },
  { value: '6', label: 'June', abbreviation: 'Jun' },
  { value: '7', label: 'July', abbreviation: 'Jul' },
  { value: '8', label: 'August', abbreviation: 'Aug' },
  { value: '9', label: 'September', abbreviation: 'Sep' },
  { value: '10', label: 'October', abbreviation: 'Oct' },
  { value: '11', label: 'November', abbreviation: 'Nov' },
  { value: '12', label: 'December', abbreviation: 'Dec' },
];

const FIRST_YEAR_OPTION = 2000;

function getYearOptions() {
  const lastYear = new Date().getFullYear() + 2;

  return Array.from({ length: lastYear - FIRST_YEAR_OPTION + 1 }, (_, index) =>
    String(FIRST_YEAR_OPTION + index)
  );
}

interface DateFieldProps extends Omit<
  React.ComponentPropsWithRef<'input'>,
  'type' | 'value' | 'onChange'
> {
  value: string;
  onChange: (value: string) => void;
  clearable?: boolean;
  calendarPlacement?: CalendarPlacement;
  calendarLabel?: string;
  inputClassName?: string;
}

interface DateFieldCalendarProps {
  calendarLabel: string;
  disabled?: boolean;
  focusedDate: CalendarDate;
  selectedDate: CalendarDate | null;
  onFocusChange: (date: CalendarDate) => void;
  onSelect: (date: CalendarDate) => void;
}

function DateFieldCalendar({
  calendarLabel,
  disabled,
  focusedDate,
  selectedDate,
  onFocusChange,
  onSelect,
}: DateFieldCalendarProps) {
  const yearOptions = React.useMemo(() => getYearOptions(), []);
  const setFocusedMonth = (month: string) =>
    onFocusChange(focusedDate.set({ month: Number(month) }));
  const setFocusedYear = (year: string) => onFocusChange(focusedDate.set({ year: Number(year) }));
  const focusedMonthAbbreviation = MONTH_OPTIONS[focusedDate.month - 1]?.abbreviation ?? '';
  const focusedMonthContext = `${focusedMonthAbbreviation} ${focusedDate.year}`;

  return (
    <Calendar
      aria-label={calendarLabel}
      value={selectedDate}
      focusedValue={focusedDate}
      onFocusChange={onFocusChange}
      onChange={onSelect}
      isDisabled={Boolean(disabled)}
      className="text-popover-foreground flex w-full flex-col gap-3"
    >
      <header className="flex min-h-11 flex-col gap-2">
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2">
          <AriaButton
            slot="previous"
            aria-label="Previous month"
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-primary flex size-9 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </AriaButton>
          <div
            aria-hidden="true"
            className="text-popover-foreground min-w-0 truncate text-center text-sm font-medium tabular-nums"
          >
            {focusedMonthContext}
          </div>
          <AriaButton
            slot="next"
            aria-label="Next month"
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-primary flex size-9 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </AriaButton>
        </div>
        <div className="grid grid-cols-[minmax(6rem,1fr)_5.25rem] items-center gap-2">
          <Select
            value={String(focusedDate.month)}
            onValueChange={setFocusedMonth}
            disabled={disabled}
          >
            <SelectTrigger aria-label="Calendar month" className="h-9 min-w-[6rem] px-2 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="center">
              {MONTH_OPTIONS.map(month => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(focusedDate.year)}
            onValueChange={setFocusedYear}
            disabled={disabled}
          >
            <SelectTrigger aria-label="Calendar year" className="h-9 min-w-[5.25rem] px-2 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="center">
              {yearOptions.map(year => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>
      <CalendarGrid className="w-full table-fixed border-collapse">
        <CalendarGridHeader>
          {day => (
            <CalendarHeaderCell className="text-muted-foreground h-8 text-center text-[0.7rem] font-semibold tracking-[0.08em] uppercase">
              {day}
            </CalendarHeaderCell>
          )}
        </CalendarGridHeader>
        <CalendarGridBody>
          {date => (
            <CalendarCell
              date={date}
              className={({
                isDisabled,
                isFocusVisible,
                isOutsideMonth,
                isPressed,
                isSelected,
                isToday,
                isUnavailable,
              }) =>
                cn(
                  'text-foreground mx-auto flex size-10 items-center justify-center rounded-full border border-transparent bg-transparent text-sm font-medium transition-colors outline-none',
                  !isDisabled && !isUnavailable && 'hover:bg-muted',
                  isOutsideMonth && 'text-muted-foreground opacity-50',
                  isPressed && 'bg-muted',
                  isToday && !isSelected && 'border-primary text-primary font-semibold',
                  isSelected &&
                    'border-primary bg-primary text-primary-foreground hover:bg-primary opacity-100 shadow-sm',
                  isFocusVisible && 'ring-primary ring-2',
                  (isDisabled || isUnavailable) && 'pointer-events-none opacity-40'
                )
              }
            />
          )}
        </CalendarGridBody>
      </CalendarGrid>
    </Calendar>
  );
}

function DateField({
  value,
  onChange,
  clearable = false,
  calendarPlacement = 'popover',
  calendarLabel = 'date',
  className,
  inputClassName,
  disabled,
  required,
  id,
  ref,
  onBlur,
  ...inputProps
}: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = React.useMemo(() => getDateFieldSelectedDate(value), [value]);
  const fallbackFocusedDate = React.useMemo(() => getDateFieldFocusedDate(value), [value]);
  const [focusedDateState, setFocusedDateState] = React.useState<{
    date: CalendarDate;
    value: string;
  }>(() => ({ date: fallbackFocusedDate, value }));
  const focusedDate =
    focusedDateState.value === value ? focusedDateState.date : fallbackFocusedDate;
  const setFocusedDate = React.useCallback(
    (date: CalendarDate) => setFocusedDateState({ date, value }),
    [value]
  );

  const calendarId = React.useId();
  const canClear = clearable && Boolean(value) && !disabled;
  const resolvedCalendarLabel = `Choose ${calendarLabel}`;
  const hasCalendarButton = calendarPlacement === 'popover';
  const hasTrailingControls = canClear || hasCalendarButton;

  const handleSelect = (date: CalendarDate) => {
    if (disabled) return;

    onChange(formatDateOnlyForDateField(date));
    setFocusedDate(date);
    if (calendarPlacement === 'popover') {
      setOpen(false);
    }
  };

  const normalizeTypedDateValue = (event: React.FocusEvent<HTMLInputElement>) => {
    const normalizedValue = normalizeDateFieldInput(event.target.value);
    if (normalizedValue !== value) {
      onChange(normalizedValue);
    }

    onBlur?.(event);
  };

  const calendar = (
    <DateFieldCalendar
      calendarLabel={resolvedCalendarLabel}
      disabled={disabled}
      focusedDate={focusedDate}
      selectedDate={selectedDate}
      onFocusChange={setFocusedDate}
      onSelect={handleSelect}
    />
  );

  const field = (
    <div className={cn('relative flex items-center', className)}>
      <Input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="YYYY-MM-DD"
        value={value}
        onChange={event => onChange(event.target.value)}
        onBlur={normalizeTypedDateValue}
        disabled={disabled}
        required={required}
        className={cn(
          'font-mono tracking-normal max-sm:h-11',
          canClear && hasCalendarButton && 'pr-20 max-sm:pr-24',
          canClear && !hasCalendarButton && 'pr-11 max-sm:pr-12',
          !canClear && hasCalendarButton && 'pr-11 max-sm:pr-12',
          inputClassName
        )}
        {...inputProps}
      />
      {hasTrailingControls && (
        <div className="absolute inset-y-0 right-1 flex items-center gap-1">
          {canClear && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Clear ${calendarLabel}`}
              onClick={() => onChange('')}
              className="text-muted-foreground size-8 max-sm:size-11"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          )}
          {hasCalendarButton && (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={resolvedCalendarLabel}
                  aria-controls={open ? calendarId : undefined}
                  aria-expanded={open}
                  aria-haspopup="dialog"
                  disabled={disabled}
                  className="text-muted-foreground size-8 max-sm:size-11"
                >
                  <CalendarDays className="size-4" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                id={calendarId}
                align="end"
                className="w-[min(calc(100vw-2rem),20rem)] p-3"
              >
                {calendar}
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
    </div>
  );

  if (calendarPlacement === 'inline') {
    return (
      <div className="space-y-3">
        {field}
        <div className="border-border bg-popover text-popover-foreground rounded-lg border p-3">
          {calendar}
        </div>
      </div>
    );
  }

  return field;
}

export { DateField };
