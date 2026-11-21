import { useQuery } from '@tanstack/react-query';
import { RandomizerTargetsService } from '@/services/pocketbase/randomizerTargets.service';
import type { RandomizerEligibility, RandomizerMode } from '@/types/randomizer';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import { queryKeys } from '@/hooks/queries/queryKeys';

interface UseRandomizerTargetsParams {
  userId: string | undefined;
  mode: RandomizerMode;
  eligibility: RandomizerEligibility;
  enabled?: boolean;
}

export function useRandomizerTargets({
  userId,
  mode,
  eligibility,
  enabled = true,
}: UseRandomizerTargetsParams) {
  return useQuery({
    queryKey: queryKeys.randomizerTargets.list(userId ?? '', mode, eligibility),
    queryFn: () => RandomizerTargetsService.listTargets(userId!, mode, eligibility),
    enabled: Boolean(userId) && enabled,
    ...queryFreshness('interactive'),
  });
}

export function useRandomizerHasTargets({
  userId,
  mode,
  enabled,
}: Omit<UseRandomizerTargetsParams, 'eligibility'>) {
  return useQuery({
    queryKey: queryKeys.randomizerTargets.presence(userId ?? '', mode),
    queryFn: () => RandomizerTargetsService.hasTargets(userId!, mode),
    enabled: Boolean(userId) && enabled,
    /* eslint-disable no-restricted-syntax -- one-off presence check, never cached */
    staleTime: 0,
    gcTime: 0,
    /* eslint-enable no-restricted-syntax */
  });
}
