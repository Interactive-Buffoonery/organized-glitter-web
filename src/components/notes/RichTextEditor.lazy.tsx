import { Suspense, lazy, type ComponentProps } from 'react';

import { cn } from '@/lib/utils';

const RichTextEditor = lazy(() => import('./RichTextEditor'));

type RichTextEditorProps = ComponentProps<typeof RichTextEditor>;

/**
 * Skeleton that matches the loaded editor's outer chrome (border, glass,
 * min-height) so the layout does not shift when the chunk arrives.
 */
const EditorSkeleton = ({ disabled }: { disabled?: boolean }) => (
  <div
    role="status"
    aria-busy="true"
    aria-live="polite"
    className={cn(
      'overflow-hidden rounded-xl border border-[hsl(var(--glass-border))]',
      'bg-[hsl(var(--glass-bg))] shadow-[inset_0_1px_0_hsl(var(--glass-highlight)),0_2px_8px_rgba(0,0,0,0.08)]',
      'backdrop-blur-xl backdrop-saturate-150',
      disabled && 'opacity-60'
    )}
  >
    <span className="sr-only">Loading editor</span>
    <div className="border-b border-[hsl(var(--glass-border))] px-3 py-2">
      <div className="bg-muted-foreground/10 h-9 w-48 animate-pulse rounded-md" />
    </div>
    <div className="min-h-[150px] p-3">
      <div className="bg-muted-foreground/10 h-4 w-32 animate-pulse rounded" />
    </div>
  </div>
);

const LazyRichTextEditor = (props: RichTextEditorProps) => (
  <Suspense fallback={<EditorSkeleton disabled={props.disabled} />}>
    <RichTextEditor {...props} />
  </Suspense>
);

export default LazyRichTextEditor;
