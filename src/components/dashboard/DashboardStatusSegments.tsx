import { usePostHog } from '@posthog/react';
import { StatusChips } from '@/components/shared/StatusChips';
import { AnalyticsEvent } from '@/services/analytics-events';
import type { DashboardDisplayedStatusCounts } from '@/hooks/queries/useDashboardStatusCounts';
import type { ProjectFilterStatus } from '@/types/project';

interface DashboardStatusSegmentsProps {
  activeStatus: ProjectFilterStatus;
  displayedCounts: DashboardDisplayedStatusCounts | null;
  isLoadingCounts: boolean;
  hasCountError: boolean;
  onStatusChange: (status: ProjectFilterStatus) => void;
}
const STATUS_SEGMENTS: Array<{ status: ProjectFilterStatus; label: string }> = [
  { status: 'everything', label: 'All' },
  { status: 'wishlist', label: 'Wishlist' },
  { status: 'purchased', label: 'Purchased' },
  { status: 'stash', label: 'In stash' },
  { status: 'kitted', label: 'Kitted' },
  { status: 'progress', label: 'In progress' },
  { status: 'onhold', label: 'On hold' },
  { status: 'completed', label: 'Completed' },
];

export default function DashboardStatusSegments({
  activeStatus,
  displayedCounts,
  isLoadingCounts,
  hasCountError,
  onStatusChange,
}: DashboardStatusSegmentsProps) {
  const posthog = usePostHog();
  return (
    <StatusChips
      value={activeStatus}
      options={STATUS_SEGMENTS.map(({ status, label }) => ({
        value: status,
        label,
        count: !isLoadingCounts && !hasCountError ? displayedCounts?.[status] : undefined,
      }))}
      onChange={status => {
        onStatusChange(status);
        posthog.capture(AnalyticsEvent.DASHBOARD_STATUS_SEGMENT_CLICKED, {
          status,
          count: displayedCounts?.[status] ?? null,
        });
      }}
    />
  );
}
