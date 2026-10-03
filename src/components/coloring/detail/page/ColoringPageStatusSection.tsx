import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Section } from '@/components/shared/Section';
import { cn } from '@/lib/utils';
import {
  ColoringPagesStatusOptions,
  type ColoringPagesStatusOptions as ColoringPageStatus,
} from '@/types/pocketbase.types';
import { getColoringPageStatusLabel } from '@/utils/statusColors';
import { getColoringPageStatusPresentation } from '@/components/coloring/coloringPagePresentation';

const STATUS_OPTIONS: ColoringPageStatus[] = [
  ColoringPagesStatusOptions.not_started,
  ColoringPagesStatusOptions.palette_chosen,
  ColoringPagesStatusOptions.in_progress,
  ColoringPagesStatusOptions.on_hold,
  ColoringPagesStatusOptions.completed,
];

interface ColoringPageStatusSectionProps {
  status: ColoringPageStatus;
  disabled?: boolean;
  onStatusChange: (status: ColoringPageStatus) => void | Promise<unknown>;
}

export function ColoringPageStatusSection({
  status,
  disabled = false,
  onStatusChange,
}: ColoringPageStatusSectionProps) {
  const presentation = getColoringPageStatusPresentation(status);

  return (
    <Section landmark={false}>
      <Select
        value={status}
        onValueChange={value => onStatusChange(value as ColoringPageStatus)}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label="Change page status"
          className={cn(
            'bg-background/70 size-auto min-w-36 rounded-full border-0 px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-offset-0',
            presentation.textClassName
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {STATUS_OPTIONS.map(option => (
            <SelectItem key={option} value={option}>
              {getColoringPageStatusLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Section>
  );
}
