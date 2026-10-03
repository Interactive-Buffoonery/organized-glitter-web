import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ColoringEmptyStateProps {
  hasFilters?: boolean;
  onClearFilters?: () => void;
}

export function ColoringEmptyState({
  hasFilters = false,
  onClearFilters,
}: ColoringEmptyStateProps) {
  if (hasFilters) {
    return (
      <div className="border-border bg-card flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center">
        <h3 className="mb-2 text-lg font-semibold">No matches</h3>
        <p className="text-muted-foreground mb-4 max-w-sm text-sm">
          Nothing in your library matches the current filters
        </p>
        {onClearFilters && (
          <Button variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="border-border bg-card flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center">
      <h3 className="mb-2 text-lg font-semibold">No coloring books yet</h3>
      <p className="text-muted-foreground mb-6 max-w-sm text-sm">
        Track each page in your coloring collection
      </p>
      <Button asChild>
        <Link to="/projects/new?craft=coloring">
          <Plus className="mr-2 size-4" aria-hidden />
          Add your first book
        </Link>
      </Button>
    </div>
  );
}
