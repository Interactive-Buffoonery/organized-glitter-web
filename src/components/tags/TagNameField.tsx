import { useId, type ComponentProps } from 'react';
import FormField from '@/components/projects/form/FormField';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TAG_NAME_MAX_LENGTH } from './tagNameValidation';

type TagNameFieldProps = Pick<ComponentProps<'input'>, 'ref' | 'disabled' | 'aria-describedby'> & {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export function TagNameField({
  value,
  onChange,
  error,
  'aria-describedby': describedBy,
  ...props
}: TagNameFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const length = value.trim().length;
  const descriptions =
    [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <FormField id={id} label="Tag Name" required>
      <div className="relative">
        <Input
          {...props}
          id={id}
          required
          placeholder="Enter tag name"
          value={value}
          onChange={event => onChange(event.target.value)}
          aria-invalid={!!error}
          aria-describedby={descriptions}
          className="pr-16"
        />
        {length > 0 && (
          <div
            className={cn(
              'absolute top-1/2 right-2 -translate-y-1/2 text-xs',
              length > TAG_NAME_MAX_LENGTH ? 'text-destructive-text' : 'text-muted-foreground'
            )}
          >
            {length}/{TAG_NAME_MAX_LENGTH}
          </div>
        )}
      </div>
      <p
        id={errorId}
        aria-live="polite"
        aria-atomic="true"
        className="text-destructive-text text-xs"
      >
        {error}
      </p>
    </FormField>
  );
}
