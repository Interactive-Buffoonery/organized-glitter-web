import { usePostHog } from '@posthog/react';
import { StatusChips } from '@/components/shared/StatusChips';
import { AnalyticsEvent } from '@/services/analytics-events';
import type { DashboardDisplayedStatusCounts } from '@/hooks/queries/useDashboardStatusCounts';
import type { ProjectFilterStatus } from '@/types/project';
import { PROJECT_FILTER_STATUS_LABEL } from '@/utils/statusColors';

interface DashboardStatusSegmentsProps {
  activeStatus: ProjectFilterStatus;
  displayedCounts: DashboardDisplayedStatusCounts | null;
  isLoadingCounts: boolean;
  hasCountError: boolean;
  onStatusChange: (status: ProjectFilterStatus) => void;
}
const STATUS_SEGMENTS: ProjectFilterStatus[] = [
  'everything',
  'wishlist',
  'purchased',
  'stash',
  'kitted',
  'progress',
  'onhold',
  'completed',
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
      options={STATUS_SEGMENTS.map(status => ({
        value: status,
        label: PROJECT_FILTER_STATUS_LABEL[status],
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
