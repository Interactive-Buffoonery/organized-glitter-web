import type React from 'react';
import type {
  ColoringBookFormFieldErrors,
  ColoringBookFormValues,
} from '@/schemas/coloring/coloringBook.schema';
import { cn } from '@/lib/utils';
import { getColoringBookErrorId } from './coloringBookFormTypes';

export const FieldError = ({
  field,
  fieldErrors,
}: {
  field: keyof ColoringBookFormValues;
  fieldErrors: ColoringBookFormFieldErrors;
}) => {
  const message = fieldErrors[field];
  if (!message) return null;
  return (
    <p id={getColoringBookErrorId(field)} role="alert" className="text-destructive-text text-sm">
      {message}
    </p>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-foreground inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight">
    <span aria-hidden="true" className="bg-primary inline-block h-[2px] w-[22px] rounded-sm" />
    {children}
  </h3>
);

interface SectionProps {
  label: string;
  children: React.ReactNode;
  flush?: 'always' | 'lg';
  className?: string;
}

const flushClass = {
  always: 'space-y-4 pb-2',
  lg: 'border-border/60 mt-6 space-y-4 border-t pt-6 pb-2 lg:mt-0 lg:border-t-0 lg:pt-0',
} as const;

export const Section = ({ label, children, flush, className }: SectionProps) => (
  <section
    className={cn(
      flush ? flushClass[flush] : 'border-border/60 mt-6 space-y-4 border-t pt-6 pb-2',
      className
    )}
  >
    <SectionLabel>{label}</SectionLabel>
    {children}
  </section>
);
