export type NotificationKind = 'success' | 'warning' | 'error' | 'info';

export interface AppNotification {
  kind: NotificationKind;
  title: string;
  description?: string;
  durationMs?: number;
}
