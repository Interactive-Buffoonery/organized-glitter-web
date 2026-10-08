import { useEffect, useState, useSyncExternalStore } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  getAnalyticsPreference,
  setAnalyticsEnabled,
  subscribeAnalyticsPreference,
} from '@/services/analytics-preference';

export function AnalyticsPreference() {
  const preference = useSyncExternalStore(subscribeAnalyticsPreference, getAnalyticsPreference);
  const [failedSave, setFailedSave] = useState<{
    accountId: string | null;
    enabled: boolean;
  } | null>(null);
  useEffect(() => {
    if (
      failedSave &&
      (failedSave.accountId !== preference.accountId ||
        (preference.ready && preference.enabled === failedSave.enabled))
    ) {
      setFailedSave(null);
    }
  }, [failedSave, preference.accountId, preference.ready, preference.enabled]);
  const save = async (enabled: boolean) => {
    setFailedSave(null);
    try {
      await setAnalyticsEnabled(enabled);
    } catch {
      setFailedSave({ accountId: preference.accountId, enabled });
    }
  };
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor="usage-analytics">Usage analytics</Label>
        <p id="usage-analytics-description" className="text-muted-foreground text-sm">
          Share feature usage and error reports to help improve Organized Glitter. Your choice is
          saved to your account and applies across signed-in devices. We also respect Do Not Track.
        </p>
        {!preference.ready && (
          <p role="status" className="text-muted-foreground text-sm">
            {preference.loadFailed
              ? 'Could not load your choice. Retrying automatically. Analytics are paused.'
              : 'Loading your choice. Analytics are paused.'}
          </p>
        )}
        {failedSave && (
          <p role="alert" className="text-foreground text-sm">
            Could not save your analytics choice. Please try again.
          </p>
        )}
      </div>
      <Switch
        id="usage-analytics"
        checked={preference.enabled}
        disabled={!preference.accountId || !preference.ready || preference.saving}
        onCheckedChange={save}
        aria-describedby="usage-analytics-description"
      />
    </div>
  );
}
