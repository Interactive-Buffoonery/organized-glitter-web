import { toast } from 'sonner';
import type { AppNotification, NotificationKind } from './types';

const DEFAULT_DURATION_MS: Record<NotificationKind, number> = {
  success: 4000,
  warning: 5000,
  error: 6000,
  info: 4000,
};

function getNotificationDuration(notification: AppNotification): number {
  return notification.durationMs ?? DEFAULT_DURATION_MS[notification.kind];
}

export function notify(notification: AppNotification): void {
  const duration = getNotificationDuration(notification);
  const options = {
    description: notification.description,
    duration,
  };

  switch (notification.kind) {
    case 'success':
      toast.success(notification.title, options);
      return;
    case 'warning':
      toast.warning(notification.title, options);
      return;
    case 'error':
      toast.error(notification.title, options);
      return;
    case 'info':
    default:
      toast(notification.title, options);
  }
}

export function notifySuccess(title: string, description?: string, durationMs?: number): void {
  notify({
    kind: 'success',
    title,
    description,
    durationMs,
  });
}

export function notifyWarning(title: string, description?: string, durationMs?: number): void {
  notify({
    kind: 'warning',
    title,
    description,
    durationMs,
  });
}

export function notifyError(title: string, description?: string, durationMs?: number): void {
  notify({
    kind: 'error',
    title,
    description,
    durationMs,
  });
}

export function notifyInfo(title: string, description?: string, durationMs?: number): void {
  notify({
    kind: 'info',
    title,
    description,
    durationMs,
  });
}
