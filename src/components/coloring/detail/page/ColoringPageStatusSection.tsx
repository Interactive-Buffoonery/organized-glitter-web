import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  ColoringPagesStatusOptions,
  type ColoringPagesStatusOptions as ColoringPageStatus,
} from '@/types/pocketbase.types';
import { COLORING_PAGE_STATUS_FILL, getColoringPageStatusLabel } from '@/utils/statusColors';

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
  return (
    <div>
      <Select
        value={status}
        onValueChange={value => onStatusChange(value as ColoringPageStatus)}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label="Change page status"
          className={cn(
            'h-11 min-h-11 w-auto min-w-36 rounded-full border-0 px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-offset-0',
            COLORING_PAGE_STATUS_FILL[status]
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
    </div>
  );
}
