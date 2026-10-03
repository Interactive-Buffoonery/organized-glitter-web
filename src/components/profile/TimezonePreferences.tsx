import { notify } from '@/lib/notifications';

/**
 * Timezone preference settings - inline row designed to live inside the
 * Preferences tab's "Appearance" section. Saves on select change rather
 * than via an explicit Save button.
 *
 * @author @serabi
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { Clock, Info } from 'lucide-react';
import {
  getTimezonesByRegion,
  TIMEZONE_REGIONS,
  detectUserTimezone,
} from '@/utils/date/timezoneUtils';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { createLogger } from '@/utils/logger';

const logger = createLogger('TimezonePreferences');

interface TimezonePreferencesProps {
  onTimezoneUpdate?: (timezone: string) => Promise<void> | void;
}

export function TimezonePreferences({ onTimezoneUpdate }: TimezonePreferencesProps) {
  const currentTimezone = useUserTimezone();
  const timezonesByRegion = getTimezonesByRegion();
  const detectedTimezone = detectUserTimezone();

  // pendingTimezone mirrors next-themes/theme pattern: shown immediately,
  // cleared once the parent mutation settles. The select control reads
  // pending ?? currentTimezone so the menu always reflects the user's
  // most recent click even before the server call returns.
  const [pendingTimezone, setPendingTimezone] = useState<string | null>(null);
  const selectedTimezone = pendingTimezone ?? currentTimezone;
  const isSaving = pendingTimezone !== null;

  const persist = async (next: string) => {
    if (next === currentTimezone) return;

    setPendingTimezone(next);
    try {
      logger.info('Updating timezone preference', { timezone: next });
      if (onTimezoneUpdate) {
        await onTimezoneUpdate(next);
      }
      notify({
        kind: 'success',
        title: 'Time zone updated',
        description: `Set to ${next}.`,
      });
    } catch (error) {
      logger.error('Failed to update timezone preference', { error });
      notify({
        kind: 'error',
        title: 'Update failed',
        description: 'Could not update your time zone. Please try again.',
      });
    } finally {
      setPendingTimezone(null);
    }
  };

  const handleSelectChange = (value: string) => {
    if (value.startsWith('__header_')) return;
    void persist(value);
  };

  const handleDetect = () => {
    const detected = detectUserTimezone();
    if (detected === selectedTimezone) {
      notify({
        kind: 'info',
        title: 'Already detected',
        description: `Your time zone is already ${detected}.`,
      });
      return;
    }
    void persist(detected);
  };

  const detectionMismatch = detectedTimezone && detectedTimezone !== selectedTimezone && !isSaving;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Time zone</span>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-full p-0.5 focus-visible:ring-2 focus-visible:outline-none"
              aria-label="How time zones work"
            >
              <Info className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-72 text-sm">
            <p className="mb-2 font-medium">How time zones work</p>
            <ul className="text-muted-foreground space-y-1 text-xs">
              <li>Date fields display in your selected zone.</li>
              <li>No data is changed, just the format you see.</li>
              <li>Auto-detect uses your browser's setting.</li>
              <li>Changes take effect immediately.</li>
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-2">
        <Select value={selectedTimezone} onValueChange={handleSelectChange} disabled={isSaving}>
          <SelectTrigger className="w-full sm:w-[260px]" aria-label="Time zone">
            <SelectValue placeholder="Select your time zone" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {Object.entries(timezonesByRegion).map(([region, timezones]) => (
              <React.Fragment key={region}>
                <SelectItem
                  value={`__header_${region}`}
                  disabled
                  className="text-muted-foreground font-semibold"
                >
                  {TIMEZONE_REGIONS[region as keyof typeof TIMEZONE_REGIONS]}
                </SelectItem>
                {timezones.map(tz => (
                  <SelectItem key={tz.value} value={tz.value} className="pl-4">
                    {tz.label}
                  </SelectItem>
                ))}
              </React.Fragment>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDetect}
          disabled={isSaving}
          className="self-end sm:self-auto pointer-coarse:min-h-11"
        >
          <Clock className="size-4" />
          Auto-detect
        </Button>
      </div>

      {detectionMismatch && (
        <p className="text-muted-foreground text-xs sm:basis-full sm:text-right">
          Browser detected: {detectedTimezone}
        </p>
      )}
    </div>
  );
}
