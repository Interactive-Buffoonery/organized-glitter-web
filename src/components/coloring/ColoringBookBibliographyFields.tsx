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
import { FieldError, Section } from './ColoringBookFormPrimitives';
import {
  getColoringBookErrorId,
  type ColoringBookFieldSectionProps,
} from './coloringBookFormTypes';

const NONE_VALUE = '__none__';

export function ColoringBookBibliographyFields({
  values,
  fieldErrors,
  isSubmitting,
  setField,
  maxTotalPages,
}: ColoringBookFieldSectionProps & { maxTotalPages: number }) {
  return (
    <Section label="Details">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="coloring-total-pages">Pages *</Label>
          <Input
            className="min-h-11"
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
            <SelectTrigger className="min-h-11" id="coloring-book-format" aria-label="Format">
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
        <div className="space-y-2">
          <Label htmlFor="coloring-publication-year">Publication year</Label>
          <Input
            className="min-h-11"
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
            className="min-h-11"
            id="coloring-edition"
            value={values.edition ?? ''}
            onChange={event => setField('edition', event.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-2 lg:col-span-2">
          <Label htmlFor="coloring-series">Series</Label>
          <Input
            className="min-h-11"
            id="coloring-series"
            value={values.series ?? ''}
            onChange={event => setField('series', event.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-2 lg:col-span-2">
          <Label htmlFor="coloring-theme">Theme</Label>
          <Input
            className="min-h-11"
            id="coloring-theme"
            value={values.theme ?? ''}
            onChange={event => setField('theme', event.target.value)}
            placeholder="Pixar"
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-2 lg:col-span-2">
          <Label htmlFor="coloring-isbn">ISBN</Label>
          <Input
            className="min-h-11"
            id="coloring-isbn"
            value={values.isbn ?? ''}
            onChange={event => setField('isbn', event.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-2 lg:col-span-2">
          <Label htmlFor="coloring-language">Language</Label>
          <Select
            value={values.language || NONE_VALUE}
            onValueChange={value =>
              setField('language', value === NONE_VALUE ? '' : (value as ColoringBookLanguage))
            }
            disabled={isSubmitting}
          >
            <SelectTrigger className="min-h-11" id="coloring-language" aria-label="Language">
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
        </div>{' '}
      </div>
    </Section>
  );
}
