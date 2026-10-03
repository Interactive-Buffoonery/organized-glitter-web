import { Loader2 } from 'lucide-react';
import { Section, SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ColoringMediumRecord } from '@/types/coloringMedium';

interface ColoringPageMediumPickerProps {
  mediums: ColoringMediumRecord[];
  isLoading: boolean;
  selectedMediumIds: string[];
  disabled?: boolean;
  onMediumToggle: (mediumId: string, checked: boolean) => void;
}

export function ColoringPageMediumPicker({
  mediums,
  isLoading,
  selectedMediumIds,
  disabled = false,
  onMediumToggle,
}: ColoringPageMediumPickerProps) {
  return (
    <Section variant="bordered" className="space-y-3" landmark={false}>
      <div>
        <SectionHeading id="coloring-page-mediums-heading">Mediums</SectionHeading>
      </div>

      {isLoading ? (
        <output className="flex items-center gap-2 text-sm">
          <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />
          Loading mediums…
        </output>
      ) : mediums.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No coloring mediums yet. Add them from Manage Lists.
        </p>
      ) : (
        <div
          role="group"
          aria-labelledby="coloring-page-mediums-heading"
          className="flex flex-wrap gap-2"
        >
          {mediums.map(medium => {
            const checked = selectedMediumIds.includes(medium.id);
            return (
              <Button
                key={medium.id}
                type="button"
                variant={checked ? 'default' : 'outline'}
                size="sm"
                className={cn('h-auto rounded-full px-3 py-1.5', !checked && 'bg-background/40')}
                onClick={() => onMediumToggle(medium.id, !checked)}
                disabled={disabled}
                aria-pressed={checked}
              >
                {medium.name}
              </Button>
            );
          })}
        </div>
      )}
    </Section>
  );
}
