import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAnalyticsPreference } from '@/hooks/useAnalyticsPreference';
import { setAnalyticsEnabled } from '@/services/analytics-preference';

export function AnalyticsPreference() {
  const enabled = useAnalyticsPreference();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor="usage-analytics">Usage analytics</Label>
        <p id="usage-analytics-description" className="text-muted-foreground text-sm">
          Share feature usage and error reports to help improve Organized Glitter. This choice
          applies to this browser. We also respect Do Not Track.
        </p>
      </div>
      <Switch
        id="usage-analytics"
        checked={enabled}
        onCheckedChange={setAnalyticsEnabled}
        aria-describedby="usage-analytics-description"
      />
    </div>
  );
}
