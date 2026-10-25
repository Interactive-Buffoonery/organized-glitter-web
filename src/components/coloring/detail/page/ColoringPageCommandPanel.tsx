import { ColorsSummary } from './ColorsSummary';
import type { UseColoringPageLifecycleDatesResult } from '@/hooks/coloring/useColoringPageLifecycleDates';
import type { UseColoringPageMediumSelectionResult } from '@/hooks/coloring/useColoringPageMediumSelection';
import type { UseColoringPageMysteryRevealResult } from '@/hooks/coloring/useColoringPageMysteryReveal';
import type { UseColoringPageStatusActionResult } from '@/hooks/coloring/useColoringPageStatusAction';
import { GlassPanel } from '@/components/ui/glass-panel';
import type { ColoringBookDTO, ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import type { ColoringMediumRecord } from '@/types/coloringMedium';
import { ColoringPageLifecycleDateSection } from './ColoringPageLifecycleDateSection';
import { ColoringPageMediumPicker } from './ColoringPageMediumPicker';
import { ColoringPageMysteryRevealSection } from './ColoringPageMysteryRevealSection';
import { ColoringPageStatusSection } from './ColoringPageStatusSection';

interface ColoringPageCommandPanelProps {
  page: ColoringPageDTO;
  book: ColoringBookDTO;
  mediums: ColoringMediumRecord[];
  isMediumsLoading: boolean;
  userTimezone: string;
  statusAction: UseColoringPageStatusActionResult;
  lifecycleDates: UseColoringPageLifecycleDatesResult;
  mediumSelection: UseColoringPageMediumSelectionResult;
  mysteryReveal: UseColoringPageMysteryRevealResult;
  returnTo: string;
}

export function ColoringPageCommandPanel({
  page,
  book,
  mediums,
  isMediumsLoading,
  userTimezone,
  statusAction,
  lifecycleDates,
  mediumSelection,
  mysteryReveal,
  returnTo,
}: ColoringPageCommandPanelProps) {
  return (
    <GlassPanel className="space-y-6 p-4 md:p-5 lg:sticky lg:top-24">
      <ColoringPageStatusSection
        status={page.status}
        onStatusChange={statusAction.changeStatus}
        disabled={statusAction.isPending}
      />

      <ColoringPageLifecycleDateSection
        startedAtValue={lifecycleDates.startedAtValue}
        completedAtValue={lifecycleDates.completedAtValue}
        startedAtDraft={lifecycleDates.startedAtDraft}
        completedAtDraft={lifecycleDates.completedAtDraft}
        onStartedAtDraftChange={lifecycleDates.setStartedAtDraft}
        onCompletedAtDraftChange={lifecycleDates.setCompletedAtDraft}
        onStartedAtSave={lifecycleDates.saveStartedAt}
        onCompletedAtSave={lifecycleDates.saveCompletedAt}
        onStartedAtClear={lifecycleDates.clearStartedAt}
        onCompletedAtClear={lifecycleDates.clearCompletedAt}
        disabled={lifecycleDates.isPending}
      />

      <ColoringPageMediumPicker
        mediums={mediums}
        isLoading={isMediumsLoading}
        selectedMediumIds={mediumSelection.selectedMediumIds}
        onMediumToggle={mediumSelection.toggleMedium}
        disabled={mediumSelection.isPending}
      />

      <ColorsSummary bookId={book.id} pageId={page.id} returnTo={returnTo} />

      {book.isMystery ? (
        <ColoringPageMysteryRevealSection
          page={page}
          userTimezone={userTimezone}
          isEditingReveal={mysteryReveal.isEditingReveal}
          revealedSubject={mysteryReveal.revealedSubject}
          onStartEditing={mysteryReveal.startRevealEditing}
          onCancelEditing={mysteryReveal.cancelRevealEditing}
          onRevealedSubjectChange={mysteryReveal.setRevealedSubject}
          onRevealSubmit={mysteryReveal.submitReveal}
          onClearReveal={mysteryReveal.clearReveal}
          disabled={mysteryReveal.isPending}
        />
      ) : null}
    </GlassPanel>
  );
}
