import { cn } from '@/lib/utils';

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function LoadingSpinner({ className, ...props }: LoadingSpinnerProps) {
  return (
    <div
      {...props}
      className={cn(
        'border-primary size-8 animate-spin rounded-full border-b-2 motion-reduce:animate-none',
        className
      )}
      aria-hidden="true"
    />
  );
}
