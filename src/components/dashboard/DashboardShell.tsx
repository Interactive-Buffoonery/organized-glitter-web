import type { ReactNode } from 'react';
import { ChevronDown, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import SegmentedControl, {
  type SegmentedControlOption,
} from '@/components/shared/SegmentedControl';
import { Button } from '@/components/ui/button';
import { useMobileDevice } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type DashboardMode = 'diamond' | 'coloring-books';

interface DashboardShellProps {
  activeMode: DashboardMode;
  canUseDiamond: boolean;
  canUseColoring: boolean;
  onModeChange: (mode: DashboardMode) => void;
  children: ReactNode;
}

const DASHBOARD_OPTIONS: Array<SegmentedControlOption<DashboardMode> & { phoneLabel: string }> = [
  { value: 'diamond', label: 'Diamond paintings', phoneLabel: 'Diamond' },
  { value: 'coloring-books', label: 'Coloring books', phoneLabel: 'Books' },
];

const getVisibleCraftOptions = (canUseDiamond: boolean, canUseColoring: boolean) =>
  DASHBOARD_OPTIONS.filter(option => {
    if (option.value === 'diamond') return canUseDiamond;
    return canUseColoring;
  });

function NewProjectAction({
  canUseDiamond,
  canUseColoring,
}: Pick<DashboardShellProps, 'canUseDiamond' | 'canUseColoring'>) {
  if (canUseDiamond && canUseColoring) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" className="pointer-coarse:min-h-11">
            <PlusCircle className="mr-2 size-4" />
            New project
            <ChevronDown className="ml-1 size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild>
            <Link to="/projects/new">New Diamond Painting</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/projects/new?craft=coloring">New Coloring Book</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (canUseColoring) {
    return (
      <Button asChild size="sm" className="pointer-coarse:min-h-11">
        <Link to="/projects/new?craft=coloring">
          <PlusCircle className="mr-2 size-4" />
          New project
        </Link>
      </Button>
    );
  }

  return (
    <Button asChild size="sm" className="pointer-coarse:min-h-11">
      <Link to="/projects/new">
        <PlusCircle className="mr-2 size-4" />
        New project
      </Link>
    </Button>
  );
}

export function DashboardShell({
  activeMode,
  canUseDiamond,
  canUseColoring,
  onModeChange,
  children,
}: DashboardShellProps) {
  const { isMobile, isTablet } = useMobileDevice();
  const useShortLabels = isMobile && !isTablet;
  const craftOptions = getVisibleCraftOptions(canUseDiamond, canUseColoring).map(option => ({
    value: option.value,
    label: useShortLabels ? option.phoneLabel : option.label,
    accessibleLabel: option.label,
  }));

  return (
    <div className="container mx-auto space-y-6 px-4 py-6 lg:space-y-8 lg:py-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-4">
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
              variant="glass"
              className="w-full sm:w-auto"
              buttonClassName="px-4 whitespace-nowrap"
            />
          ) : null}
        </div>
        <NewProjectAction canUseDiamond={canUseDiamond} canUseColoring={canUseColoring} />
      </header>

      {children}
    </div>
  );
}
