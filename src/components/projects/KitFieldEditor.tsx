import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjectFieldUpdateMutation } from '@/hooks/mutations/useProjectFieldUpdateMutation';
import { buildUpdateProjectFormData } from '@/hooks/mutations/projectMutationAdapters';
import type { UpdateProjectInput } from '@/hooks/mutations/projectCommands';
import type { ProjectType } from '@/types/project';
import type { KitField } from './ProjectDetailFacts';

const LABELS: Record<KitField, string> = {
  size: 'Size',
  totalDiamonds: 'Drills',
  drillShape: 'Drill shape',
  colorCount: 'Colors',
  company: 'Company',
  artist: 'Artist',
  kitCategory: 'Kit type',
  sourceUrl: 'Kit link',
};

export default function KitFieldEditor({
  project,
  field,
  onClose,
}: {
  project: ProjectType;
  field: KitField;
  onClose: () => void;
}) {
  const [value, setValue] = useState(
    field === 'size' ? String(project.width ?? '') : String(project[field] ?? '')
  );
  const [height, setHeight] = useState(String(project.height ?? ''));
  const mutation = useProjectFieldUpdateMutation<UpdateProjectInput>({
    label: 'kit details',
    buildFormData: (input, context) =>
      buildUpdateProjectFormData(input, context.userId, context.userTimezone),
  });
  const label = LABELS[field];
  const numeric = field === 'size' || field === 'totalDiamonds' || field === 'colorCount';
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const input: UpdateProjectInput = { projectId: project.id };
    if (field === 'size') {
      input.width = value ? Number(value) : null;
      input.height = height ? Number(height) : null;
    } else if (field === 'company') input.companyName = value.trim() || null;
    else if (field === 'artist') input.artistName = value.trim() || null;
    else if (field === 'kitCategory') input.kitCategory = value as 'full' | 'mini';
    else if (field === 'totalDiamonds' || field === 'colorCount')
      input[field] = value ? Number(value) : null;
    else input[field] = value.trim() || null;
    mutation.mutate(input, { onSuccess: onClose });
  };
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>{label}</DialogTitle>
        <DialogDescription>Update this kit's {label.toLowerCase()}.</DialogDescription>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kit-field-value">{field === 'size' ? 'Width (cm)' : label}</Label>
            {field === 'drillShape' || field === 'kitCategory' ? (
              <Select
                value={value || 'empty'}
                onValueChange={next => setValue(next === 'empty' ? '' : next)}
                disabled={mutation.isPending}
              >
                <SelectTrigger id="kit-field-value" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field === 'drillShape' && <SelectItem value="empty">Not set</SelectItem>}
                  {(field === 'drillShape'
                    ? [
                        ['round', 'Round'],
                        ['square', 'Square'],
                      ]
                    : [
                        ['full', 'Full sized kit'],
                        ['mini', 'Mini kit'],
                      ]
                  ).map(([key, text]) => (
                    <SelectItem key={key} value={key}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="kit-field-value"
                value={value}
                onChange={event => setValue(event.target.value)}
                type={numeric ? 'number' : field === 'sourceUrl' ? 'url' : 'text'}
                min={numeric ? 1 : undefined}
                step={field === 'size' ? 'any' : 1}
                disabled={mutation.isPending}
                className="min-h-11"
              />
            )}
          </div>
          {field === 'size' && (
            <div className="space-y-2">
              <Label htmlFor="kit-height">Height (cm)</Label>
              <Input
                id="kit-height"
                type="number"
                min="1"
                step="any"
                value={height}
                onChange={event => setHeight(event.target.value)}
                disabled={mutation.isPending}
                className="min-h-11"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="min-h-11"
              disabled={mutation.isPending || (field === 'kitCategory' && !value)}
            >
              {mutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
