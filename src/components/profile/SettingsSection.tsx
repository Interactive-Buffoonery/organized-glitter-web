import React from 'react';
import { cn } from '@/lib/utils';

type SectionTone = 'default' | 'danger';

/**
 * One row inside a settings GlassPanel. Pair with `divide-border/60 divide-y`
 * on the parent so consecutive sections share hairline dividers instead of
 * each drawing its own border.
 *
 * - `tone="danger"` adds a tinted background and a left accent rail so the
 *   section reads as "be careful here" without needing the words to do that
 *   work alone.
 * - `collapsible` renders the section as a native `<details>/<summary>`
 *   disclosure. The trigger keeps the tone styling so users still see that a
 *   danger zone exists; they just don't see the body until they ask.
 */
export function SettingsSection({
  title,
  description,
  tone = 'default',
  collapsible = false,
  children,
}: {
  title: string;
  description?: string;
  tone?: SectionTone;
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const sectionTone = cn(
    tone === 'danger' && 'bg-destructive/5 border-l-2 border-l-destructive/40'
  );

  const ruleClass = cn('h-px w-4 shrink-0', tone === 'danger' ? 'bg-destructive/50' : 'bg-border');
  const titleClass = cn(
    'text-xs font-semibold tracking-wider uppercase',
    tone === 'danger' ? 'text-destructive-text/90' : 'text-muted-foreground'
  );

  if (collapsible) {
    return (
      <details className={cn('group', sectionTone)}>
        <summary
          className={cn(
            'flex cursor-pointer items-center justify-between gap-2 p-5 select-none sm:p-6',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
            'list-none [&::-webkit-details-marker]:hidden'
          )}
        >
          <div className="flex items-center gap-3">
            <span aria-hidden className={ruleClass} />
            <h2 className={titleClass}>{title}</h2>
          </div>
          <span
            className={cn(
              'text-xs transition-transform group-open:rotate-90',
              tone === 'danger' ? 'text-destructive-text/70' : 'text-muted-foreground'
            )}
            aria-hidden
          >
            ▶
          </span>
        </summary>
        <div className="space-y-4 px-5 pb-6 sm:px-6">
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
          {children}
        </div>
      </details>
    );
  }

  return (
    <section className={cn('space-y-4 p-5 first:pt-6 last:pb-6 sm:p-6', sectionTone)}>
      <div className="flex items-center gap-3">
        <span aria-hidden className={ruleClass} />
        <h2 className={titleClass}>{title}</h2>
      </div>
      {description && <p className="text-muted-foreground text-sm">{description}</p>}
      {children}
    </section>
  );
}
