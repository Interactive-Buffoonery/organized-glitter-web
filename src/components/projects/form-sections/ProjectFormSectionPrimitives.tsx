import type { ChangeEvent, ClipboardEvent, ReactNode } from 'react';
import type { ProjectFormValues } from '@/types/project';
import { getErrorId } from './projectFormSectionUtils';

export type ProjectFormFieldChange = (
  field: keyof ProjectFormValues,
  value: ProjectFormValues[keyof ProjectFormValues]
) => void;

export type NumberInputHandlers = {
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
};

const flushClass = {
  always: 'space-y-4 pb-2',
  lg: 'border-border/60 mt-6 space-y-4 border-t pt-6 pb-2 lg:mt-0 lg:border-t-0 lg:pt-0',
} as const;

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <h3 className="text-foreground inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight">
    <span aria-hidden="true" className="bg-primary inline-block h-[2px] w-[22px] rounded-sm" />
    {children}
  </h3>
);

export const Section = ({
  label,
  children,
  flush,
}: {
  label: string;
  children: ReactNode;
  flush?: 'always' | 'lg';
}) => (
  <section
    className={flush ? flushClass[flush] : 'border-border/60 mt-6 space-y-4 border-t pt-6 pb-2'}
  >
    <SectionLabel>{label}</SectionLabel>
    {children}
  </section>
);

export const FieldError = ({
  field,
  message,
}: {
  field: keyof ProjectFormValues;
  message?: string;
}) => {
  if (!message) return null;

  return (
    <p id={getErrorId(field)} className="text-destructive-text mt-1 text-sm">
      {message}
    </p>
  );
};
