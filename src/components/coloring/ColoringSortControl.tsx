import { useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ColoringSortField, ColoringSortDirection } from '@/contexts/ColoringFilterContext';

const options: Array<{ value: ColoringSortField; label: string }> = [
  { value: 'date_added', label: 'Date added' },
  { value: 'title', label: 'Title' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'completion', label: 'Progress' },
  { value: 'last_activity', label: 'Last activity' },
];
export function ColoringSortControl({
  field,
  direction,
  onChange,
}: {
  field: ColoringSortField;
  direction: ColoringSortDirection;
  onChange: (field: ColoringSortField, direction: ColoringSortDirection) => void;
}) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const label = `${options.find(option => option.value === field)?.label} (${direction === 'asc' ? 'ascending' : 'descending'})`;
  const choices = (
    <div
      role="group"
      aria-label="Sort coloring books"
      className="min-h-0 flex-1 overflow-y-auto p-4"
    >
      {options.map(option => (
        <section key={option.value} className="mb-4">
          <h3 className="text-muted-foreground mb-2 text-sm font-semibold">{option.label}</h3>
          <div className="bg-card overflow-hidden rounded-lg border">
            {(['asc', 'desc'] as const).map(nextDirection => (
              <button
                type="button"
                aria-pressed={field === option.value && direction === nextDirection}
                key={nextDirection}
                className="hover:bg-muted focus-visible:ring-ring flex min-h-11 w-full items-center gap-3 border-b px-4 py-3 text-left text-sm last:border-b-0 focus-visible:ring-2"
                onClick={() => {
                  onChange(option.value, nextDirection);
                  setOpen(false);
                }}
              >
                <span
                  aria-hidden="true"
                  className={`size-4 rounded-full border-2 ${field === option.value && direction === nextDirection ? 'border-primary bg-primary' : 'border-muted-foreground'}`}
                />
                {option.label} ({nextDirection === 'asc' ? 'ascending' : 'descending'})
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        onClick={() => setOpen(true)}
        aria-label={`Sort coloring books. Current sort: ${label}`}
      >
        <ArrowUpDown className="size-4" aria-hidden="true" />
        <span className="text-muted-foreground">Sort:</span>
        <span className="hidden sm:inline">{label}</span>
      </Button>
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="h-[70dvh]">
            <DrawerTitle className="px-4 pt-4">Sort books</DrawerTitle>
            <DrawerDescription className="px-4">Choose how books are ordered</DrawerDescription>
            {choices}
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent className="flex flex-col p-0 pt-6">
            <SheetTitle className="px-4">Sort books</SheetTitle>
            <SheetDescription className="px-4">Choose how books are ordered</SheetDescription>
            {choices}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
