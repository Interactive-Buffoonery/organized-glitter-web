import type { ProjectFilterStatus, ProjectStatus } from '@/types/project';
import { cn } from '@/lib/utils';
import { FILTER_STATUS_DOT, PROJECT_STATUS_DOT } from '@/utils/statusColors';

interface StatusDotProps {
  status: ProjectStatus | ProjectFilterStatus;
  kind?: 'project' | 'filter';
  className?: string;
}

const StatusDot = ({ status, kind = 'project', className }: StatusDotProps) => {
  const colorClass =
    kind === 'filter'
      ? FILTER_STATUS_DOT[status as ProjectFilterStatus]
      : PROJECT_STATUS_DOT[status as ProjectStatus];

  return <span aria-hidden="true" className={cn('size-2 rounded-full', colorClass, className)} />;
};

export default StatusDot;
