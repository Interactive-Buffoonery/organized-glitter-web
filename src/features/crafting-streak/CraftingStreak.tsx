import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Ellipsis, Flame, Pencil, Undo2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { useCraftingStreak } from '@/hooks/queries/useCraftingStreak';
import { useMarkCraftingDay, useUnmarkCraftingDay } from '@/hooks/mutations/useCraftingDayMarks';
import { useMobileDevice } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { WeekDay } from './streak';
import { useStreakMode } from './useStreakMode';

const NoteTargetPicker = lazy(() =>
  import('@/components/notes-feed/NoteTargetPicker').then(module => ({
    default: module.NoteTargetPicker,
  }))
);

const calendarDate = (day: string) => new Date(`${day}T12:00:00Z`);
const fullDate = (day: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(calendarDate(day));
const weekdayLetter = (day: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'narrow' }).format(
    calendarDate(day)
  );

function dayState(day: WeekDay) {
  if (day.status === 'activity')
    return { spoken: 'crafted', subtext: 'Counted from your activity' };
  if (day.status === 'marked') return { spoken: 'marked by you', subtext: 'Marked by you' };
  return {
    spoken: day.isToday ? 'no activity yet' : 'missed',
    subtext: 'No activity this day',
  };
}

interface DayAction {
  label: string;
  icon: ReactNode;
  tone: 'primary' | 'default' | 'quiet';
  run: () => void;
}

function DayFace({ day, open }: { day: WeekDay; open: boolean }) {
  const done = day.status !== 'none';
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'flex size-7 items-center justify-center rounded-full',
          done && 'bg-accent text-accent-foreground',
          open && 'outline-accent outline-2 outline-offset-[3px]'
        )}
      >
        {done ? (
          <Check className="size-3.5" strokeWidth={3} />
        ) : day.isToday ? (
          <span className="bg-accent size-2 rounded-full" />
        ) : (
          <span className="bg-muted-foreground/45 size-1.5 rounded-full" />
        )}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'text-muted-foreground text-[11px] leading-none',
          day.isToday && 'text-foreground font-bold'
        )}
      >
        {weekdayLetter(day.day)}
      </span>
    </>
  );
}

const dayButtonClass =
  'flex w-[30px] flex-col items-center gap-1.5 rounded-lg py-1 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none';

const actionClass = (tone: DayAction['tone']) =>
  cn(
    'flex w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-[15px] font-medium',
    tone === 'primary' && 'bg-accent text-accent-foreground',
    tone === 'quiet' && 'text-muted-foreground'
  );

function Week({ week }: { week: WeekDay[] }) {
  const { isPhone } = useMobileDevice();
  const markDay = useMarkCraftingDay();
  const unmarkDay = useUnmarkCraftingDay();
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [noteDay, setNoteDay] = useState<string | null>(null);

  const actionsFor = (day: WeekDay): DayAction[] => {
    const addNote: DayAction = {
      label: 'Add a note for this day',
      icon: <Pencil aria-hidden="true" className="size-4" />,
      tone: 'default',
      run: () => setNoteDay(day.day),
    };
    if (day.status === 'activity') return [addNote];
    if (day.status === 'marked') {
      return [
        addNote,
        {
          label: 'Unmark this day',
          icon: <Undo2 aria-hidden="true" className="size-4" />,
          tone: 'quiet',
          run: () => day.markId && unmarkDay.mutate(day.markId),
        },
      ];
    }
    return [
      {
        label: 'Mark as a crafting day',
        icon: <Check aria-hidden="true" className="size-4" strokeWidth={3} />,
        tone: 'primary',
        run: () => markDay.mutate(day.day),
      },
      addNote,
    ];
  };

  const sheetDay = isPhone ? week.find(day => day.day === openDay) : undefined;

  return (
    <>
      <ul
        aria-label="This week"
        className="order-3 flex basis-full justify-between sm:order-none sm:ml-auto sm:basis-auto sm:justify-start sm:gap-[5px]"
      >
        {week.map(day => {
          const label = `${fullDate(day.day)}, ${dayState(day).spoken}. Options`;
          const open = openDay === day.day;
          return (
            <li key={day.day}>
              {isPhone ? (
                <button
                  type="button"
                  aria-label={label}
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  onClick={() => setOpenDay(day.day)}
                  className={dayButtonClass}
                >
                  <DayFace day={day} open={open} />
                </button>
              ) : (
                <DropdownMenu
                  open={open}
                  onOpenChange={value => setOpenDay(value ? day.day : null)}
                >
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={label} className={dayButtonClass}>
                      <DayFace day={day} open={open} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="center"
                    sideOffset={8}
                    aria-label={fullDate(day.day)}
                    className="bg-card w-[264px] rounded-[14px] p-1.5 shadow-lg"
                  >
                    <DropdownMenuLabel className="px-3 py-2.5 font-normal">
                      <span className="block text-[15px] font-bold">{fullDate(day.day)}</span>
                      <span className="text-muted-foreground block text-[13px]">
                        {dayState(day).subtext}
                      </span>
                    </DropdownMenuLabel>
                    {actionsFor(day).map(action => (
                      <DropdownMenuItem
                        key={action.label}
                        onSelect={action.run}
                        className={cn(
                          actionClass(action.tone),
                          'min-h-11',
                          action.tone === 'primary' &&
                            'focus:bg-accent/90 focus:text-accent-foreground dark:focus:bg-accent/90'
                        )}
                      >
                        {action.icon}
                        {action.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>

      {isPhone ? (
        <Drawer open={!!sheetDay} onOpenChange={value => !value && setOpenDay(null)}>
          <DrawerContent className="bg-card rounded-t-[20px] px-4 pt-2 pb-7 [&>div:first-child]:mt-0 [&>div:first-child]:h-1 [&>div:first-child]:w-9">
            {sheetDay ? (
              <>
                <div className="px-3 pt-4 pb-3">
                  <DrawerTitle className="text-[17px] font-bold tracking-normal">
                    {fullDate(sheetDay.day)}
                  </DrawerTitle>
                  <DrawerDescription className="text-muted-foreground text-[13px]">
                    {dayState(sheetDay).subtext}
                  </DrawerDescription>
                </div>
                {actionsFor(sheetDay).map(action => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      setOpenDay(null);
                      action.run();
                    }}
                    className={cn(
                      actionClass(action.tone),
                      'focus-visible:ring-ring min-h-[52px] focus-visible:ring-2 focus-visible:outline-none'
                    )}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </>
            ) : null}
          </DrawerContent>
        </Drawer>
      ) : null}

      {noteDay ? (
        <Suspense fallback={null}>
          <NoteTargetPicker
            open
            onOpenChange={value => !value && setNoteDay(null)}
            initialDate={noteDay}
          />
        </Suspense>
      ) : null}
    </>
  );
}

function Row() {
  const { count, week, isPending } = useCraftingStreak();
  const label =
    count === undefined
      ? isPending
        ? 'Crafting streak loading'
        : 'Crafting streak unavailable'
      : count === 0
        ? 'Start a crafting streak'
        : `${count}-day crafting streak`;
  const title =
    count === undefined
      ? 'Crafting streak'
      : count === 0
        ? 'Start a crafting streak'
        : `${count} day streak`;
  const showWeek = count !== undefined && week.some(day => day.status !== 'none');
  return (
    <div className="border-border/60 mb-8 flex min-h-16 flex-wrap items-center gap-x-6 gap-y-3 border-y py-3.5">
      <Link
        to="/notes"
        aria-label={`${label}. Opens Notes.`}
        className="focus-visible:ring-ring flex min-h-11 items-center gap-2 rounded-lg text-lg font-bold tracking-[-0.02em] focus-visible:ring-2 focus-visible:outline-none"
      >
        {count === undefined ? (
          <Ellipsis aria-hidden="true" className="text-muted-foreground size-[22px]" />
        ) : (
          <Flame
            aria-hidden="true"
            className="text-accent size-[22px]"
            fill={count > 0 ? 'currentColor' : 'none'}
          />
        )}
        <span aria-hidden="true" className={cn(count === undefined && 'text-muted-foreground')}>
          {title}
        </span>
      </Link>
      {showWeek ? <Week week={week} /> : null}
      <Link
        to="/notes"
        tabIndex={-1}
        aria-hidden="true"
        className={cn(
          'text-muted-foreground order-2 ml-auto flex size-11 items-center justify-center',
          showWeek && 'sm:order-none sm:ml-0'
        )}
      >
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

export function CraftingStreak() {
  const { mode } = useStreakMode();
  return mode === 'home' ? <Row /> : null;
}
