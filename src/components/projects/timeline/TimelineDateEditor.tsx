import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { normalizeDateFieldInput } from '@/components/ui/date-field-utils';
import { useUpdateProjectDatesSectionMutation } from '@/hooks/mutations/useProjectDetailMutations';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateInUserTimezone } from '@/utils/date/timezoneUtils';
import { cn } from '@/lib/utils';
import type { DateFieldKey } from '@/hooks/mutations/projectCommands';
import type { ProjectStatus } from '@/types/project';

interface TimelineDateEditorProps {
  dateKey: DateFieldKey;
  label: string;
  value: string | null | undefined;
  projectId: string;
  currentStatus?: ProjectStatus;
  isSet: boolean;
  formattedDisplay: string;
  className?: string;
  editorState: TimelineDateEditorState | null;
  onEditorStateChange: Dispatch<SetStateAction<TimelineDateEditorState | null>>;
}

export interface TimelineDateEditorState {
  projectId: string;
  dateKey: DateFieldKey;
  draft: string;
}

const TimelineDateEditor = ({
  dateKey,
  label,
  value,
  projectId,
  currentStatus,
  isSet,
  formattedDisplay,
  className,
  editorState,
  onEditorStateChange,
}: TimelineDateEditorProps) => {
  const userTimezone = useUserTimezone();
  const updateDates = useUpdateProjectDatesSectionMutation();
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const inputRef = useRef<HTMLInputElement>(null);

  const inputValue = value ? formatDateInUserTimezone(value, userTimezone, 'yyyy-MM-dd') : '';
  const open = editorState?.projectId === projectId && editorState.dateKey === dateKey;
  const draft = open ? editorState.draft : inputValue;

  const setDraft = (next: string) => {
    onEditorStateChange(current =>
      current?.projectId === projectId && current.dateKey === dateKey
        ? { ...current, draft: next }
        : current
    );
  };

  const handleOpenChange = (next: boolean) => {
    onEditorStateChange(current => {
      if (next) return { projectId, dateKey, draft: inputValue };
      return current?.projectId === projectId && current.dateKey === dateKey ? null : current;
    });
  };

  const submit = (nextValue: string | null) => {
    const normalizedValue = nextValue === null ? null : normalizeDateFieldInput(nextValue);
    const isClearOnEmpty = normalizedValue === null && !isSet;
    if (normalizedValue === inputValue || isClearOnEmpty) {
      handleOpenChange(false);
      return;
    }
    updateDates.mutate(
      { projectId, [dateKey]: normalizedValue },
      { onSuccess: () => handleOpenChange(false) }
    );
  };

  useEffect(() => {
    if (!open) return;

    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => {
      // Keep the mounted editor surface while open so a resize cannot dismiss its draft.
      if (!open) setIsDesktop(media.matches);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [open]);

  const trigger = (
    <button
      type="button"
      aria-label={`Edit ${label} date`}
      className={cn(
        'cursor-pointer rounded-sm text-left transition-colors',
        'decoration-border underline-offset-4 hover:underline',
        'focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:outline-none',
        isSet
          ? 'text-foreground hover:text-foreground font-medium'
          : 'text-muted-foreground/55 hover:text-muted-foreground font-normal italic',
        className
      )}
    >
      {isSet ? formattedDisplay : 'Not set'}
    </button>
  );

  const editor = (
    <>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
        {isDesktop ? (
          <DialogTitle className="text-muted-foreground mb-3 flex min-h-9 items-center pr-10 text-[11px] font-semibold tracking-[0.12em] uppercase">
            {label}
          </DialogTitle>
        ) : (
          <h3 className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.12em] uppercase">
            {label}
          </h3>
        )}
        <DateField
          ref={inputRef}
          aria-label={`${label} date`}
          value={draft}
          onChange={setDraft}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit(draft);
            }
          }}
          calendarLabel={`${label.toLowerCase()} date`}
          calendarPlacement="inline"
          disabled={updateDates.isPending}
          inputClassName="text-sm"
        />
        {(currentStatus === 'archived' || currentStatus === 'destashed') &&
          dateKey === 'dateCompleted' && (
            <p className="text-muted-foreground mt-2 text-xs">
              Adding a completion date keeps this project {currentStatus}.
            </p>
          )}
      </div>
      <div className="bg-popover flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
        {isSet && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => submit(null)}
            disabled={updateDates.isPending}
            className="text-muted-foreground hover:text-foreground"
          >
            Clear
          </Button>
        )}
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => submit(draft)}
          disabled={updateDates.isPending || draft === inputValue}
        >
          Save
        </Button>
      </div>
    </>
  );

  return isDesktop ? (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-popover text-popover-foreground flex max-h-[calc(100dvh-2rem)] w-80 max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0">
        <DialogDescription className="sr-only">Choose a date, then save it.</DialogDescription>
        {editor}
      </DialogContent>
    </Dialog>
  ) : (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="flex max-h-72 w-64 flex-col overflow-hidden p-0"
        align="end"
        side="top"
      >
        {editor}
      </PopoverContent>
    </Popover>
  );
};

export default TimelineDateEditor;
