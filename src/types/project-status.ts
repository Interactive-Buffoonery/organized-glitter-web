/**
 * Shared project status types
 */

export type ProjectStatus =
  | 'wishlist'
  | 'purchased'
  | 'stash'
  | 'kitted'
  | 'progress'
  | 'onhold'
  | 'completed'
  | 'archived'
  | 'destashed';
export type ProjectFilterStatus = ProjectStatus | 'everything';
