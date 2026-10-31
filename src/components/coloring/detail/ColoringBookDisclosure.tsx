import type { ReactNode } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useIsMobile } from '@/hooks/use-mobile';

export function ColoringBookDisclosure({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const compact = useIsMobile();
  if (!compact) return <>{children}</>;
  return (
    <Accordion type="single" collapsible className="min-w-0">
      <AccordionItem value={title}>
        <AccordionTrigger type="button" className="min-h-11 min-w-0 font-sans text-sm">
          <span className="shrink-0">{title}</span>
          <span className="text-muted-foreground ml-auto min-w-0 truncate text-xs font-normal">
            {summary}
          </span>
        </AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
