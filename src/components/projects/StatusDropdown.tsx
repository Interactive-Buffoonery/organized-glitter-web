// No React import needed with modern JSX transform
import { ProjectStatus } from '@/types/project';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjectStatus } from '@/hooks/useProjectStatus';
import { cn } from '@/lib/utils';

interface StatusDropdownProps {
  currentStatus: ProjectStatus;
  onStatusChange: (status: ProjectStatus) => void;
  /**
   * `default`: full-width Select trigger (form control look).
   * `pill`: compact rounded pill with a leading colored dot, suited for the
   *   project detail title row. Still opens the same status menu on click.
   */
  variant?: 'default' | 'pill';
}

// Map the color classes to match the dropdown's design
// Using the 12-color palette for consistent tag colors
const getDropdownStatusColor = (status: string) => {
  const colorMap: Record<string, string> = {
    wishlist: 'text-blue-600 dark:text-blue-400',
    purchased: 'text-purple-600 dark:text-purple-400',
    stash: 'text-amber-600 dark:text-amber-400',
    kitted: 'text-teal-600 dark:text-teal-400',
    progress: 'text-emerald-600 dark:text-emerald-400',
    onhold: 'text-orange-600 dark:text-orange-400',
    completed: 'text-indigo-600 dark:text-indigo-400',
    destashed: 'text-rose-600 dark:text-rose-400',
    archived: 'text-muted-foreground',
  };
  return colorMap[status] || '';
};

const StatusDropdown = ({
  currentStatus,
  onStatusChange,
  variant = 'default',
}: StatusDropdownProps) => {
  const { getStatusLabel } = useProjectStatus();
  const colorClass = getDropdownStatusColor(currentStatus);

  if (variant === 'pill') {
    return (
      <Select value={currentStatus} onValueChange={value => onStatusChange(value as ProjectStatus)}>
        <SelectTrigger
          className={cn(
            // Compact pill: tinted background, colored dot leading, no border chrome
            'inline-flex size-auto min-w-0 items-center gap-2 rounded-full border-0 bg-current/10 px-3 py-1.5 text-xs font-semibold tracking-[0.02em] shadow-none focus:ring-0 focus:ring-offset-0',
            // Hide the default chevron so the pill stays minimal; it's clear-on-hover
            '[&>svg]:hidden',
            colorClass
          )}
          aria-label="Change project status"
        >
          <span
            className="size-1.5 shrink-0 rounded-full bg-current opacity-100 shadow-[0_0_0_3px_currentColor]"
            style={{ boxShadow: '0 0 0 3px color-mix(in srgb, currentColor 18%, transparent)' }}
            aria-hidden="true"
          />
          <SelectValue placeholder={getStatusLabel(currentStatus)} />
        </SelectTrigger>
        <SelectContent className="bg-popover text-popover-foreground">
          <SelectItem value="wishlist">Wishlist</SelectItem>
          <SelectItem value="purchased">Purchased - Not Received</SelectItem>
          <SelectItem value="stash">In Stash</SelectItem>
          <SelectItem value="kitted">Kitted Up, Not Started</SelectItem>
          <SelectItem value="progress">In Progress</SelectItem>
          <SelectItem value="onhold">On Hold</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
          <SelectItem value="destashed">Destashed</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="w-full">
      <Select value={currentStatus} onValueChange={value => onStatusChange(value as ProjectStatus)}>
        <SelectTrigger className={`${colorClass} font-medium`} aria-label="Change project status">
          <SelectValue placeholder={getStatusLabel(currentStatus)} />
        </SelectTrigger>
        <SelectContent className="bg-popover text-popover-foreground">
          <SelectItem value="wishlist">Wishlist</SelectItem>
          <SelectItem value="purchased">Purchased - Not Received</SelectItem>
          <SelectItem value="stash">In Stash</SelectItem>
          <SelectItem value="kitted">Kitted Up, Not Started</SelectItem>
          <SelectItem value="progress">In Progress</SelectItem>
          <SelectItem value="onhold">On Hold</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
          <SelectItem value="destashed">Destashed</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default StatusDropdown;
