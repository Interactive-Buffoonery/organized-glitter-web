import type { DashboardValidSortField } from './dashboard.constants';

export interface ProjectsTableColumn {
  id: string;
  label: string;
  className?: string;
  headerClassName?: string;
  sortField?: DashboardValidSortField;
}

export const PROJECTS_TABLE_COLUMNS: readonly ProjectsTableColumn[] = [
  { id: 'thumbnail', label: 'Thumbnail', className: 'w-16' },
  { id: 'title', label: 'Kit', sortField: 'kit_name', className: 'min-w-[16rem]' },
  {
    id: 'status',
    label: 'Status',
    sortField: 'status',
    className: 'w-28',
    headerClassName: 'text-center',
  },
  { id: 'company', label: 'Company', sortField: 'company', className: 'w-40' },
  { id: 'size-shape', label: 'Size · Shape', sortField: 'width', className: 'w-36' },
  { id: 'date', label: 'Latest', className: 'w-36' },
  { id: 'actions', label: '', className: 'w-12' },
] as const;
