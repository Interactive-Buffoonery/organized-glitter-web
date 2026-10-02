import { Section, SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';

interface PageLifecycleDateFieldProps {
  id: string;
  label: string;
  value: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
  disabled?: boolean;
}

function PageLifecycleDateField({
  id,
  label,
  value,
  draft,
  onDraftChange,
  onSave,
  onClear,
  disabled = false,
}: PageLifecycleDateFieldProps) {
  const canSave = draft !== value;
  const canClear = value !== '';

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <DateField
          id={id}
          value={draft}
          onChange={onDraftChange}
          calendarLabel={`${label.toLowerCase()} date`}
          disabled={disabled}
        />
        <div className="flex gap-2 sm:shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={disabled || !canSave}
          >
            Save
          </Button>
          {canClear ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={disabled}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ColoringPageLifecycleDateSectionProps {
  startedAtValue: string;
  completedAtValue: string;
  startedAtDraft: string;
  completedAtDraft: string;
  disabled?: boolean;
  onStartedAtDraftChange: (value: string) => void;
  onCompletedAtDraftChange: (value: string) => void;
  onStartedAtSave: () => void;
  onCompletedAtSave: () => void;
  onStartedAtClear: () => void;
  onCompletedAtClear: () => void;
}

export function ColoringPageLifecycleDateSection({
  startedAtValue,
  completedAtValue,
  startedAtDraft,
  completedAtDraft,
  disabled = false,
  onStartedAtDraftChange,
  onCompletedAtDraftChange,
  onStartedAtSave,
  onCompletedAtSave,
  onStartedAtClear,
  onCompletedAtClear,
}: ColoringPageLifecycleDateSectionProps) {
  return (
    <Section variant="bordered" landmark={false}>
      <SectionHeading>Dates</SectionHeading>
      <PageLifecycleDateField
        id="coloring-page-started-at"
        label="Started"
        value={startedAtValue}
        draft={startedAtDraft}
        onDraftChange={onStartedAtDraftChange}
        onSave={onStartedAtSave}
        onClear={onStartedAtClear}
        disabled={disabled}
      />
      <PageLifecycleDateField
        id="coloring-page-completed-at"
        label="Completed"
        value={completedAtValue}
        draft={completedAtDraft}
        onDraftChange={onCompletedAtDraftChange}
        onSave={onCompletedAtSave}
        onClear={onCompletedAtClear}
        disabled={disabled}
      />
    </Section>
  );
}
