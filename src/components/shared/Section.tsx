import * as React from 'react';
import { cn } from '@/lib/utils';

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'default' | 'bordered';
  landmark?: boolean;
}

export function Section({
  variant = 'default',
  landmark = true,
  className,
  children,
  ...props
}: SectionProps) {
  const Comp = landmark ? 'section' : 'div';
  return (
    <Comp
      className={cn(
        'space-y-3',
        variant === 'bordered' && 'border-border/60 space-y-4 border-t pt-6',
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

interface SectionHeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h2' | 'h3';
}

export function SectionHeading({
  as: Comp = 'h2',
  className,
  children,
  ...props
}: SectionHeadingProps) {
  return (
    <Comp
      className={cn(
        'text-foreground inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight',
        className
      )}
      {...props}
    >
      <span aria-hidden="true" className="bg-primary inline-block h-[2px] w-[22px] rounded-sm" />
      {children}
    </Comp>
  );
}
