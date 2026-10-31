import type { ReactNode } from 'react';
import { PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import SegmentedControl, {
  type SegmentedControlOption,
} from '@/components/shared/SegmentedControl';
import { Button } from '@/components/ui/button';
export type DashboardMode = 'diamond' | 'coloring-books';

interface DashboardShellProps {
  activeMode: DashboardMode;
  canUseDiamond: boolean;
  canUseColoring: boolean;
  onModeChange: (mode: DashboardMode) => void;
  children: ReactNode;
}

const DASHBOARD_OPTIONS: Array<SegmentedControlOption<DashboardMode>> = [
  { value: 'diamond', label: 'Diamond paintings' },
  { value: 'coloring-books', label: 'Coloring books' },
];

const getVisibleCraftOptions = (canUseDiamond: boolean, canUseColoring: boolean) =>
  DASHBOARD_OPTIONS.filter(option => {
    if (option.value === 'diamond') return canUseDiamond;
    return canUseColoring;
  });

export function DashboardShell({
  activeMode,
  canUseDiamond,
  canUseColoring,
  onModeChange,
  children,
}: DashboardShellProps) {
  const craftOptions = getVisibleCraftOptions(canUseDiamond, canUseColoring);

  return (
    <div className="container mx-auto space-y-6 px-4 py-6 lg:space-y-8 lg:py-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
          <h1
            data-testid="library-page-heading"
            className="font-handwritten text-3xl leading-tight tracking-tight md:text-4xl"
          >
            Library
          </h1>
          {craftOptions.length > 1 ? (
            <SegmentedControl
              value={activeMode}
              options={craftOptions}
              onValueChange={onModeChange}
              variant="solid"
              className="w-full sm:w-auto"
              buttonClassName="px-4 whitespace-nowrap"
            />
          ) : null}
        </div>
        <Button asChild size="sm" className="hidden min-h-11 sm:inline-flex">
          <Link to={activeMode === 'diamond' ? '/projects/new' : '/projects/new?craft=coloring'}>
            <PlusCircle className="mr-2 size-4" />
            {activeMode === 'diamond' ? 'New kit' : 'New book'}
          </Link>
        </Button>
      </header>

      {children}
    </div>
  );
}
