import { useMemo } from 'react';
import { usePostHog } from '@posthog/react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useFilters } from '@/contexts/FilterContext';
import { AnalyticsEvent } from '@/services/analytics-events';
import {
  DASHBOARD_QUICK_VIEWS,
  getActiveDashboardQuickView,
  getDashboardQuickViewPatch,
  getDashboardQuickViewResetPatch,
} from '@/features/dashboard/quickViews';

interface DashboardQuickViewsProps {
  compact?: boolean;
}

const DashboardQuickViews = ({ compact = false }: DashboardQuickViewsProps) => {
  const { filters, setFilters, resetSearchDraft } = useFilters();
  const posthog = usePostHog();

  const activeQuickView = useMemo(() => getActiveDashboardQuickView(filters), [filters]);

  const triggerLabel = activeQuickView ? `Quick views: ${activeQuickView.label}` : 'Quick views';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(!compact && 'justify-between')}
          aria-label={triggerLabel}
        >
          <span className={cn('truncate', compact && 'max-w-[8rem]')}>
            {compact ? (activeQuickView?.label ?? 'Quick views') : triggerLabel}
          </span>
          <ChevronDown aria-hidden="true" className="ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Quick views</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border" />
        {activeQuickView && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => {
                  setFilters(getDashboardQuickViewResetPatch());
                  resetSearchDraft();
                }}
              >
                Clear quick view
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          {DASHBOARD_QUICK_VIEWS.map(quickView => {
            const isActive = activeQuickView?.id === quickView.id;

            return (
              <DropdownMenuItem
                key={quickView.id}
                onSelect={() => {
                  setFilters(getDashboardQuickViewPatch(quickView));
                  resetSearchDraft();
                  posthog.capture(AnalyticsEvent.DASHBOARD_PRESET_CHIP_CLICKED, {
                    preset: quickView.id,
                  });
                }}
                className={cn(isActive && 'bg-accent text-accent-foreground')}
              >
                <span className="truncate">{quickView.label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default DashboardQuickViews;
