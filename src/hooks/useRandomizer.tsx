import { useCallback } from 'react';
import { useAddColoringPageProgressNoteMutation } from '@/hooks/mutations/coloring/useColoringPageProgressNotes';
import { useCreateSpin } from '@/hooks/mutations/useCreateSpin';
import { useAddProgressNoteMutation } from '@/hooks/mutations/useProjectDetailMutations';
import { useSaveRandomizerNextUp } from '@/hooks/mutations/useSaveRandomizerNextUp';
import { useUpdateSpinMetadata } from '@/hooks/mutations/useUpdateSpinMetadata';
import { useRandomizerNextUp } from '@/hooks/queries/useRandomizerNextUp';
import { useSpinHistoryCount } from '@/hooks/queries/useSpinHistoryCount';
import { useAuth } from '@/hooks/useAuth';
import { useEnabledVerticals } from '@/hooks/useEnabledVerticals';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { useRandomizerSession } from '@/features/randomizer/session/useRandomizerSession';
import { RandomizerTargetsService } from '@/services/pocketbase/randomizerTargets.service';
import { getCurrentDateInUserTimezone } from '@/utils/date/timezoneUtils';
import type { MarkdownString } from '@/types/markdown';
import {
  DEFAULT_RANDOMIZER_NEXT_UP,
  type RandomizerMode,
  type RandomizerNextUpPreferences,
  type RandomizerTarget,
} from '@/types/randomizer';

export const useRandomizer = () => {
  const { user } = useAuth();
  const userTimezone = useUserTimezone();
  const {
    diamond_painting: canUseDiamond,
    coloring_books: canUseColoring,
    isLoading: isLoadingVerticals,
  } = useEnabledVerticals(user?.id);
  const { data: totalSpinCount = 0 } = useSpinHistoryCount({
    userId: user?.id,
    enabled: !!user?.id,
  });
  const { data: randomizerNextUp = DEFAULT_RANDOMIZER_NEXT_UP } = useRandomizerNextUp(user?.id);

  const createSpinMutation = useCreateSpin();
  const saveRandomizerNextUpMutation = useSaveRandomizerNextUp(user?.id);
  const updateSpinMetadataMutation = useUpdateSpinMetadata();
  const addProgressNoteMutation = useAddProgressNoteMutation();
  const addColoringPageProgressNoteMutation = useAddColoringPageProgressNoteMutation();

  const session = useRandomizerSession({
    userId: user?.id,
    canUseDiamond,
    canUseColoring,
    isLoadingVerticals,
    createSpin: createSpinMutation.mutateAsync,
    updateSpinMetadata: updateSpinMetadataMutation.mutateAsync,
    listColoringPageTargets: RandomizerTargetsService.listColoringPageTargets,
  });
  const { mode: normalizedMode, lastSpinResult, sectionDraft } = session;

  const getDefaultDiamondProgressNote = useCallback(() => {
    if (!lastSpinResult || lastSpinResult.targetType !== 'diamond_project') return '';

    const content = [`The randomizer picked this diamond art project: ${lastSpinResult.title}`];

    if (sectionDraft?.kind === 'number') {
      content.push('', `Section number: ${sectionDraft.number}`);
    } else if (sectionDraft) {
      content.push('', `Section size: ${sectionDraft.widthCm} x ${sectionDraft.heightCm} cm`);

      if (sectionDraft.estimatedDiamonds) {
        content.push(
          `Estimated diamonds (approx.): ${sectionDraft.estimatedDiamonds.toLocaleString()}`
        );
      }
    }

    return content.join('\n');
  }, [lastSpinResult, sectionDraft]);

  const saveDiamondProgressNote = useCallback(
    async (content: string) => {
      if (!lastSpinResult || lastSpinResult.targetType !== 'diamond_project') return;

      const noteContent = content.trim();
      if (!noteContent) return;

      await addProgressNoteMutation.mutateAsync({
        projectId: lastSpinResult.id,
        noteData: {
          date: getCurrentDateInUserTimezone(userTimezone),
          content: noteContent as MarkdownString,
        },
      });
    },
    [addProgressNoteMutation, lastSpinResult, userTimezone]
  );

  const getDefaultRandomizerNote = useCallback(() => {
    if (!lastSpinResult) return '';

    if (lastSpinResult.targetType === 'coloring_page') {
      return `The randomizer picked this page: ${lastSpinResult.title}`;
    }

    return '';
  }, [lastSpinResult]);

  const saveRandomizerNote = useCallback(
    async (content: string) => {
      if (!lastSpinResult || lastSpinResult.targetType !== 'coloring_page') return;

      const pageId = lastSpinResult.selectedMetadata.coloringPage;
      if (typeof pageId !== 'string' || pageId.length === 0) return;

      const nextNote = content.trim();
      if (!nextNote) return;

      await addColoringPageProgressNoteMutation.mutateAsync({
        pageId,
        noteData: {
          date: getCurrentDateInUserTimezone(userTimezone),
          content: nextNote as MarkdownString,
        },
      });
    },
    [addColoringPageProgressNoteMutation, lastSpinResult, userTimezone]
  );

  const canSaveRandomizerNote = lastSpinResult?.targetType === 'coloring_page';
  const canPickRandomPageFromBook = lastSpinResult?.targetType === 'coloring_book';

  const saveNextUpPreferences = useCallback(
    async (preferences: RandomizerNextUpPreferences) => {
      if (!user?.id) return;
      await saveRandomizerNextUpMutation.mutateAsync({
        userId: user.id,
        preferences,
      });
    },
    [saveRandomizerNextUpMutation, user?.id]
  );

  const toggleNextUpTarget = useCallback(
    async (target: RandomizerTarget) => {
      const targets = { ...randomizerNextUp.targets };

      if (targets[target.mode]?.id === target.id) {
        delete targets[target.mode];
      } else {
        targets[target.mode] = {
          id: target.id,
          mode: target.mode,
          targetType: target.targetType,
          title: target.title,
          subtitle: target.subtitle,
          href: target.href,
          savedAt: new Date().toISOString(),
        };
      }

      await saveNextUpPreferences({
        version: 1,
        targets,
      });
    },
    [randomizerNextUp.targets, saveNextUpPreferences]
  );

  const clearNextUpTarget = useCallback(
    async (modeToClear: RandomizerMode = normalizedMode) => {
      if (!randomizerNextUp.targets[modeToClear]) return;

      const targets = { ...randomizerNextUp.targets };
      delete targets[modeToClear];

      await saveNextUpPreferences({
        version: 1,
        targets,
      });
    },
    [normalizedMode, randomizerNextUp.targets, saveNextUpPreferences]
  );

  return {
    ...session,
    canUseDiamond,
    canUseColoring,
    randomizerNextUp,
    activeNextUpTarget: randomizerNextUp.targets[normalizedMode] ?? null,
    stats: { ...session.stats, recentSpins: totalSpinCount },
    isLoading: session.isLoadingTargets,
    isLoadingProjects: session.isLoadingTargets,
    isCreatingSpin: createSpinMutation.isPending,
    isSavingNextUp: saveRandomizerNextUpMutation.isPending,
    isPersistingSection: updateSpinMetadataMutation.isPending,
    isSavingProgressNote: addProgressNoteMutation.isPending,
    isSavingRandomizerNote: addColoringPageProgressNoteMutation.isPending,
    spinError: createSpinMutation.error,
    toggleNextUpTarget,
    clearNextUpTarget,
    saveDiamondProgressNote,
    saveRandomizerNote,
    canSaveRandomizerNote,
    canPickRandomPageFromBook,
    getDefaultRandomizerNote,
    getDefaultDiamondProgressNote,
  };
};
