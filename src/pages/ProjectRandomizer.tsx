import React from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  RandomizerControlsPanel,
  RandomizerCraftSelector,
} from '@/components/randomizer/RandomizerControlsPanel';
import { RandomizerNextUpPanel } from '@/components/randomizer/RandomizerNextUpPanel';
import { RandomizerPageHeader } from '@/components/randomizer/RandomizerPageHeader';
import { RandomizerResultPanel } from '@/components/randomizer/RandomizerResultPanel';
import { RandomizerTargetSelector } from '@/components/randomizer/RandomizerTargetSelector';
import { RandomizerWheel } from '@/components/randomizer/RandomizerWheel';
import { SpinHistory } from '@/components/randomizer/SpinHistory';
import { useAuth } from '@/hooks/useAuth';
import { useAppReady } from '@/hooks/useAppReady';
import { useRandomizer } from '@/hooks/useRandomizer';
import { createLogger } from '@/utils/logger';
import type { RandomizerMode } from '@/types/randomizer';

const logger = createLogger('ProjectRandomizer');

const getSpinLabel = (mode: RandomizerMode) => {
  if (mode === 'coloring-book') return 'Pick a book';
  if (mode === 'coloring-page') return 'Pick a page';
  return 'Spin';
};

const getSelectorTitle = (mode: RandomizerMode) => {
  if (mode === 'coloring-book') return 'Books';
  if (mode === 'coloring-page') return 'Pages';
  return 'Projects';
};

const getEmptyCopy = (mode: RandomizerMode) => {
  if (mode === 'coloring-book') {
    return {
      title: 'No coloring books match these filters.',
      body: 'Add a coloring book or loosen the status filters to make one eligible.',
      ctaLabel: 'Add coloring book',
      ctaHref: '/projects/new?craft=coloring',
    };
  }

  if (mode === 'coloring-page') {
    return {
      title: 'No coloring pages match these filters.',
      body: 'Add pages to a coloring book or loosen the status filters to make one eligible.',
      ctaLabel: 'Open coloring library',
      ctaHref: '/coloring',
    };
  }

  return {
    title: 'No diamond paintings match these filters.',
    body: 'Nothing to choose from yet. Add a project or change the filters.',
    ctaLabel: 'Add project',
    ctaHref: '/projects/new',
  };
};

const getOneItemNotice = (mode: RandomizerMode) => {
  if (mode === 'coloring-book') {
    return 'Only one book is selected. We recommend selecting more books before spinning the wheel.';
  }

  if (mode === 'coloring-page') {
    return 'Only one page is selected. We recommend selecting more pages before spinning the wheel.';
  }

  return 'Only one project is selected. We recommend selecting more projects before spinning the wheel.';
};

const getNoSelectionCopy = (mode: RandomizerMode) => {
  if (mode === 'coloring-book') return 'No books are currently selected.';
  if (mode === 'coloring-page') return 'No pages are currently selected.';
  return 'No projects are currently selected.';
};

function RandomizerLoadingState() {
  return (
    <div
      className="flex w-full flex-col items-center gap-5"
      role="status"
      aria-label="Loading randomizer"
    >
      <div className="bg-muted/70 aspect-square w-full max-w-72 animate-pulse rounded-full" />
      <div className="bg-muted h-11 w-44 animate-pulse rounded-md" />
    </div>
  );
}

const ProjectRandomizer: React.FC = () => {
  useAppReady();
  const { user } = useAuth();

  const {
    mode,
    canUseDiamond,
    canUseColoring,
    eligibility,
    availableTargets,
    selectedTargets,
    spinSessionKey,
    selectedTargetIds,
    randomizerNextUp,
    activeNextUpTarget,
    lastSpinResult,
    sectionDraft,
    stats,
    isLoadingTargets,
    isCreatingSpin,
    isSavingNextUp,
    isSavingProgressNote,
    isSavingRandomizerNote,
    isPickingPageFromBook,
    error,
    pagePickError,
    pagePickErrorReason,
    setMode,
    updateEligibility,
    resetEligibility,
    toggleTarget,
    selectAllTargets,
    selectNoTargets,
    toggleNextUpTarget,
    clearNextUpTarget,
    handleSpinComplete,
    handleSectionChange,
    pickRandomPageFromBook,
    clearLastResult,
    saveDiamondProgressNote,
    saveRandomizerNote,
    canSaveRandomizerNote,
    canPickRandomPageFromBook,
    getDefaultRandomizerNote,
    getDefaultDiamondProgressNote,
  } = useRandomizer();

  React.useEffect(() => {
    logger.debug('ProjectRandomizer mounted', {
      mode,
      availableTargetCount: availableTargets.length,
      selectedTargetCount: selectedTargetIds.size,
    });
  }, [mode, availableTargets.length, selectedTargetIds.size]);

  const selectorTitle = getSelectorTitle(mode);
  const spinLabel = getSpinLabel(mode);
  const emptyCopy = getEmptyCopy(mode);
  const oneItemNotice = getOneItemNotice(mode);
  const noSelectionCopy = getNoSelectionCopy(mode);
  const hasLoadedTargetsSuccessfully = !isLoadingTargets && !error;
  const hasNoTargets = hasLoadedTargetsSuccessfully && !stats.hasTargets;
  const hasNoSelection = hasLoadedTargetsSuccessfully && stats.hasTargets && !stats.hasSelection;
  const isOneItemNoticeVisible = hasLoadedTargetsSuccessfully && stats.selectedCount === 1;

  const targetSelector = (
    <RandomizerTargetSelector
      key={mode}
      targets={availableTargets}
      selectedTargetIds={selectedTargetIds}
      onTargetToggle={toggleTarget}
      onSelectAll={selectAllTargets}
      onSelectNone={selectNoTargets}
      isLoading={isLoadingTargets}
      disableScrollArea
      title={selectorTitle}
    />
  );

  return (
    <MainLayout>
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6">
        <RandomizerPageHeader />

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>
              Failed to load randomizer data. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        )}

        <RandomizerCraftSelector
          mode={mode}
          canUseDiamond={canUseDiamond}
          canUseColoring={canUseColoring}
          onModeChange={setMode}
        />

        <div className="grid min-w-0 gap-8 md:grid-cols-2 xl:gap-12">
          <section aria-label="Make a pick" className="min-w-0 md:order-last">
            <h2 className="mb-6 text-center text-xl font-semibold">What will you work on next?</h2>
            <div className="flex min-w-0 flex-col items-center">
              {isLoadingTargets ? (
                <RandomizerLoadingState />
              ) : (
                <>
                  <RandomizerWheel
                    sessionKey={spinSessionKey}
                    targets={selectedTargets}
                    onSpinComplete={handleSpinComplete}
                    disabled={!stats.canSpin || isCreatingSpin}
                    spinLabel={spinLabel}
                    labelMode="number"
                  />

                  {isOneItemNoticeVisible && (
                    <Alert className="mt-6 max-w-lg text-left">
                      <Lightbulb className="size-4" />
                      <AlertDescription>{oneItemNotice}</AlertDescription>
                    </Alert>
                  )}

                  {hasNoTargets && (
                    <Alert className="mt-6 max-w-lg text-left">
                      <Lightbulb className="size-4" />
                      <AlertDescription>
                        <span className="block font-medium">{emptyCopy.title}</span>
                        <span className="mt-1 block">{emptyCopy.body}</span>
                        <span className="mt-3 flex flex-wrap gap-2">
                          <Button variant="glass" size="sm" asChild>
                            <Link to={emptyCopy.ctaHref}>{emptyCopy.ctaLabel}</Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={resetEligibility}
                          >
                            Loosen filters
                          </Button>
                        </span>
                      </AlertDescription>
                    </Alert>
                  )}

                  {hasNoSelection && (
                    <Alert className="mt-6 max-w-lg text-left">
                      <Lightbulb className="size-4" />
                      <AlertDescription>
                        {noSelectionCopy} Select items from the list or loosen the filters.
                        <span className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="glass"
                            size="sm"
                            onClick={selectAllTargets}
                          >
                            Select all
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={resetEligibility}
                          >
                            Loosen filters
                          </Button>
                        </span>
                      </AlertDescription>
                    </Alert>
                  )}

                  <RandomizerResultPanel
                    target={lastSpinResult}
                    section={sectionDraft}
                    onSectionChange={handleSectionChange}
                    progressNote={{
                      onSave: saveDiamondProgressNote,
                      getDefault: getDefaultDiamondProgressNote,
                      isSaving: isSavingProgressNote,
                    }}
                    randomizerNote={
                      canSaveRandomizerNote
                        ? {
                            onSave: saveRandomizerNote,
                            getDefault: getDefaultRandomizerNote,
                            isSaving: isSavingRandomizerNote,
                          }
                        : undefined
                    }
                    pagePicker={
                      canPickRandomPageFromBook
                        ? {
                            onPick: pickRandomPageFromBook,
                            isPicking: isPickingPageFromBook,
                            error: pagePickError,
                            errorReason: pagePickErrorReason,
                          }
                        : undefined
                    }
                    nextUp={{
                      target: activeNextUpTarget,
                      onToggle: toggleNextUpTarget,
                      isSaving: isSavingNextUp,
                    }}
                    onClear={clearLastResult}
                  />
                </>
              )}
            </div>
            <div className="mt-6">
              <RandomizerNextUpPanel
                preferences={randomizerNextUp}
                activeMode={mode}
                canUseDiamond={canUseDiamond}
                canUseColoring={canUseColoring}
                onClear={clearNextUpTarget}
                isSaving={isSavingNextUp}
                compact
              />
            </div>
            <Accordion type="single" collapsible className="mt-4">
              <AccordionItem value="history">
                <AccordionTrigger className="font-sans text-base hover:no-underline">
                  Spin History
                </AccordionTrigger>
                <AccordionContent>
                  <SpinHistory
                    userId={user?.id}
                    canUseDiamond={canUseDiamond}
                    canUseColoring={canUseColoring}
                    disableScrollArea
                    hideHeader
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
          <section aria-label="Choose items" className="min-w-0 space-y-6">
            <RandomizerControlsPanel
              mode={mode}
              eligibility={eligibility}
              onEligibilityChange={updateEligibility}
              onResetEligibility={resetEligibility}
            />
            {targetSelector}
          </section>
        </div>
      </div>
    </MainLayout>
  );
};

export default ProjectRandomizer;
