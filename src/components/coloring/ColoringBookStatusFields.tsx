import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { COLORING_BOOK_STATUS_OPTIONS } from '@/constants/coloringBookMetadata';
import type { ColoringBooksStatusOptions } from '@/types/pocketbase.types';
import { Section } from './ColoringBookFormPrimitives';
import type { ColoringBookFieldSectionProps } from './coloringBookFormTypes';

export function ColoringBookStatusFields({
  values,
  isSubmitting,
  setField,
}: ColoringBookFieldSectionProps) {
  return (
    <Section label="Status">
      <div className="space-y-4">
        <Select
          value={values.status}
          onValueChange={value => setField('status', value as ColoringBooksStatusOptions)}
          disabled={isSubmitting}
        >
          <SelectTrigger id="coloring-status" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLORING_BOOK_STATUS_OPTIONS.map(status => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex h-10 items-center gap-3">
          <Checkbox
            id="coloring-is-mystery"
            checked={values.isMystery}
            onCheckedChange={checked => setField('isMystery', checked === true)}
            disabled={isSubmitting}
          />
          <Label htmlFor="coloring-is-mystery">Mystery coloring book?</Label>
        </div>
      </div>
    </Section>
  );
}
