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
  isSubmitting: boolean;
  fieldErrors: ProjectFormFieldErrors;
  onFieldChange: ProjectFormFieldChange;
}

export const ProjectStatusSection = ({
  formData,
  isSubmitting,
  fieldErrors,
  onFieldChange,
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
      <SelectTrigger id="status" aria-label="Status">
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
    <FieldError field="status" message={fieldErrors.status} />
  </Section>
);
