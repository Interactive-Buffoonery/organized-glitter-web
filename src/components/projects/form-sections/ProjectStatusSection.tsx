import type { RefObject } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProjectFormFieldErrors } from '@/schemas/project.schema';
import type { ProjectFormValues, ProjectStatus } from '@/types/project';
import { FieldError, Section, type ProjectFormFieldChange } from './ProjectFormSectionPrimitives';

const STATUS_OPTIONS: Record<ProjectStatus, string> = {
  wishlist: 'Wishlist',
  purchased: 'Purchased',
  stash: 'In Stash',
  kitted: 'Kitted Up, Not Started',
  progress: 'In Progress',
  onhold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
  destashed: 'Destashed',
};

interface ProjectStatusSectionProps {
  formData: ProjectFormValues;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  isSubmitting: boolean;
  fieldErrors: ProjectFormFieldErrors;
  onFieldChange: ProjectFormFieldChange;
  completionDateHint?: boolean;
}

export const ProjectStatusSection = ({
  formData,
  triggerRef,
  isSubmitting,
  fieldErrors,
  onFieldChange,
  completionDateHint,
}: ProjectStatusSectionProps) => (
  <Section label="Status">
    <Label htmlFor="status" className="sr-only">
      Status
    </Label>
    <Select
      value={formData.status || 'wishlist'}
      onValueChange={value => onFieldChange('status', value as ProjectStatus)}
      disabled={isSubmitting}
    >
      <SelectTrigger ref={triggerRef} id="status" aria-label="Status">
        <SelectValue placeholder="Select status..." />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(STATUS_OPTIONS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    {completionDateHint && (
      <p className="text-muted-foreground text-sm">
        Remove the completion date to change the status.
      </p>
    )}
    <FieldError field="status" message={fieldErrors.status} />
  </Section>
);
