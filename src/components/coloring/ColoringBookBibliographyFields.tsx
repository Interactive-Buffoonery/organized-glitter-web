import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  COLORING_BOOK_FORMAT_OPTIONS,
  COLORING_BOOK_LANGUAGE_OPTIONS,
  type ColoringBookFormat,
  type ColoringBookLanguage,
} from '@/constants/coloringBookMetadata';
import { ColoringTaxonomySelect } from './ColoringTaxonomySelect';
import { FieldError, Section } from './ColoringBookFormPrimitives';
import {
  getColoringBookErrorId,
  type ColoringBookFieldSectionProps,
} from './coloringBookFormTypes';

const NONE_VALUE = '__none__';

interface TaxonomyOption {
  id: string;
  name: string;
}

interface ColoringBookBibliographyFieldsProps extends ColoringBookFieldSectionProps {
  maxTotalPages: number;
  publishers: TaxonomyOption[];
  illustrators: TaxonomyOption[];
  onCreatePublisher: (name: string) => Promise<TaxonomyOption>;
  onCreateIllustrator: (name: string) => Promise<TaxonomyOption>;
}

export function ColoringBookBibliographyFields({
  values,
  fieldErrors,
  isSubmitting,
  setField,
  maxTotalPages,
  publishers,
  illustrators,
  onCreatePublisher,
  onCreateIllustrator,
}: ColoringBookBibliographyFieldsProps) {
  return (
    <Section label="Book Info">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="coloring-total-pages">Number of pages *</Label>
          <Input
            id="coloring-total-pages"
            type="number"
            min={1}
            max={maxTotalPages}
            value={values.totalPages}
            onChange={event =>
              setField('totalPages', event.target.value === '' ? '' : Number(event.target.value))
            }
            disabled={isSubmitting}
            aria-invalid={fieldErrors.totalPages ? 'true' : 'false'}
            aria-describedby={
              fieldErrors.totalPages ? getColoringBookErrorId('totalPages') : undefined
            }
          />
          <FieldError field="totalPages" fieldErrors={fieldErrors} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coloring-book-format">Format</Label>
          <Select
            value={values.bookFormat || NONE_VALUE}
            onValueChange={value =>
              setField('bookFormat', value === NONE_VALUE ? '' : (value as ColoringBookFormat))
            }
            disabled={isSubmitting}
          >
            <SelectTrigger id="coloring-book-format" aria-label="Format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No format</SelectItem>
              {COLORING_BOOK_FORMAT_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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

        <div className="space-y-2">
          <Label htmlFor="coloring-series">Series</Label>
          <Input
            id="coloring-series"
            value={values.series ?? ''}
            onChange={event => setField('series', event.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coloring-theme">Theme</Label>
          <Input
            id="coloring-theme"
            value={values.theme ?? ''}
            onChange={event => setField('theme', event.target.value)}
            placeholder="Pixar"
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coloring-isbn">ISBN</Label>
          <Input
            id="coloring-isbn"
            value={values.isbn ?? ''}
            onChange={event => setField('isbn', event.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coloring-language">Language</Label>
          <Select
            value={values.language || NONE_VALUE}
            onValueChange={value =>
              setField('language', value === NONE_VALUE ? '' : (value as ColoringBookLanguage))
            }
            disabled={isSubmitting}
          >
            <SelectTrigger id="coloring-language" aria-label="Language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No language</SelectItem>
              {COLORING_BOOK_LANGUAGE_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="coloring-publication-year">Publication year</Label>
          <Input
            id="coloring-publication-year"
            type="number"
            inputMode="numeric"
            value={values.publicationYear ?? ''}
            onChange={event =>
              setField(
                'publicationYear',
                event.target.value === '' ? '' : Number(event.target.value)
              )
            }
            disabled={isSubmitting}
            aria-invalid={fieldErrors.publicationYear ? 'true' : 'false'}
            aria-describedby={
              fieldErrors.publicationYear ? getColoringBookErrorId('publicationYear') : undefined
            }
          />
          <FieldError field="publicationYear" fieldErrors={fieldErrors} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coloring-edition">Edition</Label>
          <Input
            id="coloring-edition"
            value={values.edition ?? ''}
            onChange={event => setField('edition', event.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </div>
    </Section>
  );
}
