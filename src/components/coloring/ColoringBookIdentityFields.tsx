import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColoringTaxonomySelect } from './ColoringTaxonomySelect';
import { FieldError, Section } from './ColoringBookFormPrimitives';
import {
  getColoringBookErrorId,
  type ColoringBookFieldSectionProps,
} from './coloringBookFormTypes';

interface TaxonomyOption {
  id: string;
  name: string;
}

interface ColoringBookMakerProps {
  publishers: TaxonomyOption[];
  illustrators: TaxonomyOption[];
  onCreatePublisher: (name: string) => Promise<TaxonomyOption>;
  onCreateIllustrator: (name: string) => Promise<TaxonomyOption>;
}

export function ColoringBookIdentityFields({
  values,
  fieldErrors,
  isSubmitting,
  setField,
  publishers,
  illustrators,
  onCreatePublisher,
  onCreateIllustrator,
}: ColoringBookFieldSectionProps & ColoringBookMakerProps) {
  return (
    <Section label="Basics" flush="always">
      <div className="space-y-2">
        <Label htmlFor="coloring-title">Title *</Label>
        <Input
          className="min-h-11"
          id="coloring-title"
          value={values.title}
          onChange={event => setField('title', event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.title ? 'true' : 'false'}
          aria-describedby={fieldErrors.title ? getColoringBookErrorId('title') : undefined}
        />
        <FieldError field="title" fieldErrors={fieldErrors} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ColoringTaxonomySelect
          id="coloring-publisher"
          label="Publisher"
          value={values.publisher}
          options={publishers}
          disabled={isSubmitting}
          placeholder="No publisher"
          createTitle="Add publisher"
          createLabel="Add publisher"
          onChange={value => setField('publisher', value)}
          onCreate={onCreatePublisher}
        />
        <ColoringTaxonomySelect
          id="coloring-illustrator"
          label="Illustrator"
          value={values.illustrator}
          options={illustrators}
          disabled={isSubmitting}
          placeholder="No illustrator"
          createTitle="Add illustrator"
          createLabel="Add illustrator"
          onChange={value => setField('illustrator', value)}
          onCreate={onCreateIllustrator}
        />
      </div>
    </Section>
  );
}
