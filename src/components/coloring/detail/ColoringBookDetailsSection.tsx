import { SectionHeading } from '@/components/shared/Section';
import { visibleItems, type ColoringBookMetadataItem } from './coloringBookDetailData';

const DetailList = ({ items }: { items: ColoringBookMetadataItem[] }) => {
  const itemsToRender = visibleItems(items);
  if (itemsToRender.length === 0) return null;

  return (
    <dl className="divide-border/60 divide-y">
      {itemsToRender.map(item => (
        <div key={item.label} className="grid gap-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-muted-foreground text-xs font-medium">{item.label}</dt>
          <dd className="text-sm break-words">
            {item.href ? (
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="text-link underline-offset-2 hover:underline"
              >
                {item.value}
              </a>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
};

export const ColoringBookDetailsSection = ({ items }: { items: ColoringBookMetadataItem[] }) => {
  if (visibleItems(items).length === 0) return null;

  return (
    <section className="space-y-4">
      <SectionHeading>Details</SectionHeading>
      <DetailList items={items} />
    </section>
  );
};
