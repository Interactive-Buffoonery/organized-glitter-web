import type { ProjectStatus } from '@/types/project-status';

// Canonical lifecycle order. Mirrored in two other places; keep in sync:
//   - src/components/dashboard/DashboardStatusSegments.tsx (STATUS_SEGMENTS)
//   - pb_migrations/1777000000_add_status_order_to_projects.js (SQL CASE)
const STATUS_ORDER: Record<ProjectStatus, number> = {
  wishlist: 1,
  purchased: 2,
  stash: 3,
  kitted: 4,
  progress: 5,
  onhold: 6,
  completed: 7,
  archived: 8,
  destashed: 9,
};

export const statusOrderFor = (status: ProjectStatus): number => STATUS_ORDER[status] ?? 0;
