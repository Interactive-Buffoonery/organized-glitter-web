import { SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import type { ColoringBookMetadataItem } from './coloringBookDetailData';

export const ColoringBookDetailsSection = ({
  items,
  onEdit,
}: {
  items: ColoringBookMetadataItem[];
  onEdit: () => void;
}) => (
  <section className="space-y-3">
    <SectionHeading>About this book</SectionHeading>
    <dl className="divide-border/60 divide-y">
      {items.map(item => (
        <div
          key={item.label}
          className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm"
        >
          <dt className="text-muted-foreground shrink-0">{item.label}</dt>
          <dd className="min-w-0 text-right break-words">
            {item.value !== undefined && item.value !== null && item.value !== '' ? (
              item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link inline-block min-h-11 max-w-full break-all underline underline-offset-4"
                >
                  {item.value}
                </a>
              ) : (
                item.value
              )
            ) : (
              <Button
                type="button"
                variant="link"
                className="min-h-11 px-0"
                aria-label={`Add ${item.label}`}
                onClick={onEdit}
              >
                Add
              </Button>
            )}
          </dd>
        </div>
      ))}
    </dl>
  </section>
);
