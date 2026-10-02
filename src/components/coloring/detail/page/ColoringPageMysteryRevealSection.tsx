import type { FormEvent } from 'react';
import { EyeOff, Loader2, Pencil } from 'lucide-react';
import { Section, SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { formatDateInUserTimezone } from '@/utils/date/timezoneUtils';

const formatRevealedDate = (date: string, userTimezone: string) =>
  formatDateInUserTimezone(date, userTimezone);

interface ColoringPageMysteryRevealSectionProps {
  page: ColoringPageDTO;
  userTimezone: string;
  isEditingReveal: boolean;
  revealedSubject: string;
  disabled?: boolean;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onRevealedSubjectChange: (revealedSubject: string) => void;
  onRevealSubmit: () => void;
  onClearReveal: () => void;
}

export function ColoringPageMysteryRevealSection({
  page,
  userTimezone,
  isEditingReveal,
  revealedSubject,
  disabled = false,
  onStartEditing,
  onCancelEditing,
  onRevealedSubjectChange,
  onRevealSubmit,
  onClearReveal,
}: ColoringPageMysteryRevealSectionProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onRevealSubmit();
  };

  if (isEditingReveal) {
    const revealLabel = page.revealedSubject ? 'Edit reveal' : 'Reveal mystery';

    return (
      <Section landmark={false}>
        <form onSubmit={handleSubmit} className="space-y-4" aria-label={`${revealLabel} form`}>
          <div>
            <SectionHeading>{revealLabel}</SectionHeading>
            <p className="text-muted-foreground mt-1 text-sm">
              Save the subject that appeared after coloring this page.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="revealed-subject">Revealed subject</Label>
            <Input
              id="revealed-subject"
              value={revealedSubject}
              onChange={event => onRevealedSubjectChange(event.target.value)}
              placeholder="Buzz Lightyear"
              required
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancelEditing}>
              Cancel
            </Button>
            <Button type="submit" disabled={!revealedSubject.trim() || disabled}>
              {disabled && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save reveal
            </Button>
          </div>
        </form>
      </Section>
    );
  }

  if (page.revealedSubject) {
    return (
      <Section landmark={false}>
        <div>
          <SectionHeading>Revealed</SectionHeading>
          <p className="mt-2 text-lg font-semibold">{page.revealedSubject}</p>
          {page.revealedAt ? (
            <p className="text-muted-foreground mt-1 text-sm">
              revealed {formatRevealedDate(page.revealedAt, userTimezone)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearReveal}
            disabled={disabled}
          >
            <EyeOff className="mr-2 size-4" />
            Mark unrevealed
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onStartEditing}>
            <Pencil className="mr-2 size-4" />
            Edit reveal
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <Section landmark={false}>
      <div>
        <SectionHeading>What did the mystery turn out to be?</SectionHeading>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="default" onClick={onStartEditing}>
          Reveal
        </Button>
      </div>
    </Section>
  );
}
