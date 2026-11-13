import { useState, type DragEvent, type ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CoverDropzoneProps {
  htmlFor: string;
  onFile: (file: File) => void;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}

export function CoverDropzone({
  htmlFor,
  onFile,
  disabled = false,
  className,
  children,
}: CoverDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !disabled) onFile(file);
  };

  return (
    <label
      htmlFor={htmlFor}
      aria-disabled={disabled}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'group bg-muted/20 relative flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 text-center transition-all',
        'border-border/60 hover:border-primary/60 hover:bg-muted/30',
        'focus-within:border-primary focus-within:ring-ring/50 focus-within:ring-2',
        isDragging && 'border-primary bg-primary/5 ring-primary/30 ring-2 ring-offset-2',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className
      )}
    >
      <div className="bg-background/60 mb-1 rounded-full p-3 shadow-sm backdrop-blur-md transition-transform group-hover:-translate-y-0.5">
        <Upload className="text-muted-foreground group-hover:text-primary size-6" />
      </div>
      <span className="text-foreground text-sm font-medium">
        Drag & drop, or{' '}
        <span className="text-primary underline-offset-4 group-hover:underline">choose a file</span>
      </span>
      <span className="text-muted-foreground text-xs">JPG, PNG, GIF, WebP or HEIC</span>
      {children}
    </label>
  );
}
