import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ColorsSummary } from './ColorsSummary';
import { DetailSpecStrip } from './DetailSpecStrip';
import { ColoringPageDateLine } from './ColoringPageDateLine';
import { FinishDatePrompt } from './FinishDatePrompt';
import type { UseColoringPageLifecycleDatesResult } from '@/hooks/coloring/useColoringPageLifecycleDates';
import type { UseColoringPageMediumSelectionResult } from '@/hooks/coloring/useColoringPageMediumSelection';
import type { UseColoringPageMysteryRevealResult } from '@/hooks/coloring/useColoringPageMysteryReveal';
import type { UseColoringPageStatusActionResult } from '@/hooks/coloring/useColoringPageStatusAction';
import { useColorKeys } from '@/hooks/queries/coloring/useColorKeys';
import { useAuth } from '@/hooks/useAuth';
import { SectionHeading } from '@/components/shared/Section';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ColoringBookDTO, ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import type { ColoringMediumRecord } from '@/types/coloringMedium';
import { getColoringBookDetailPath } from '@/pages/coloringBookNavigation';
import { formatDateInUserTimezone, getCurrentDateInUserTimezone } from '@/utils/date/timezoneUtils';
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
  editOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  onPhotos: () => void;
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
  editOpen,
  onEditOpenChange,
  onPhotos,
}: ColoringPageCommandPanelProps) {
  const { user } = useAuth();
  const keys = useColorKeys(page.id, user?.id ?? '');
  const [editor, setEditor] = useState<'mediums' | 'dates' | null>(null);
  const selectedMediums = mediums.filter(medium =>
    mediumSelection.selectedMediumIds.includes(medium.id)
  );
  const today = getCurrentDateInUserTimezone(userTimezone);
  const start =
    page.startedAt && formatDateInUserTimezone(page.startedAt, userTimezone, 'yyyy-MM-dd');
  const end = page.completedAt
    ? formatDateInUserTimezone(page.completedAt, userTimezone, 'yyyy-MM-dd')
    : today;
  const day = start
    ? Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1)
    : null;
  const editDate = () => setEditor('dates');
  return (
    <aside className="space-y-6 lg:sticky lg:top-24" aria-label="Page details">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <ColoringPageStatusSection
            status={page.status}
            onStatusChange={statusAction.changeStatus}
            disabled={statusAction.isPending}
          />
          {day && <span className="text-muted-foreground text-sm tabular-nums">Day {day}</span>}
        </div>
        <FinishDatePrompt
          key={`${page.id}:${page.status}`}
          status={page.status}
          completedAt={page.completedAt}
          disabled={lifecycleDates.isPending}
          onPickDate={editDate}
          onToday={() => {
            lifecycleDates.setCompletedAtDraft(today);
            void lifecycleDates.saveCompletedAt();
          }}
        />
        <DetailSpecStrip
          items={[
            {
              label: 'medium',
              value: selectedMediums.length
                ? selectedMediums.map(medium => medium.name).join(', ')
                : undefined,
              onClick: () => setEditor('mediums'),
              disabled: isMediumsLoading,
            },
            {
              label: 'colors',
              value: keys.isError
                ? 'Unavailable'
                : keys.isPending
                  ? 'Loading…'
                  : keys.data?.length
                    ? String(keys.data.length)
                    : undefined,
              onClick: () =>
                document
                  .getElementById('page-colors')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
            },
            {
              label: 'photos',
              value: page.photos.length ? String(page.photos.length) : undefined,
              onClick: onPhotos,
            },
          ]}
        />
        <ColoringPageDateLine
          startedAt={page.startedAt}
          completedAt={page.completedAt}
          revealedAt={book.isMystery ? page.revealedAt : undefined}
          userTimezone={userTimezone}
          onEdit={editDate}
        />
      </div>
      <div id="page-colors" className="scroll-mt-24">
        <ColorsSummary bookId={book.id} pageId={page.id} returnTo={returnTo} />
      </div>
      {book.isMystery && (
        <div className="border-border/60 border-t pt-6">
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
        </div>
      )}
      <section className="border-border/60 hidden space-y-4 border-t pt-6 lg:block">
        <SectionHeading>About this page</SectionHeading>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Book</dt>
            <dd className="min-w-0 text-right">
              <Link
                className="decoration-primary/50 underline decoration-2 underline-offset-4"
                to={getColoringBookDetailPath(book.id, returnTo)}
              >
                {book.title}
              </Link>
            </dd>
          </div>
          {book.illustratorName && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Illustrator</dt>
              <dd className="text-right">{book.illustratorName}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Page</dt>
            <dd>
              {page.pageNumber} of {book.totalPages}
            </dd>
          </div>
        </dl>
      </section>
      <Dialog
        open={editOpen || editor !== null}
        onOpenChange={open => {
          if (!open) {
            setEditor(null);
            onEditOpenChange(false);
          }
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editOpen ? 'Edit page' : editor === 'mediums' ? 'Choose mediums' : 'Page dates'}
            </DialogTitle>
          </DialogHeader>
          {(editOpen || editor === 'dates') && (
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
          )}
          {(editOpen || editor === 'mediums') && (
            <ColoringPageMediumPicker
              mediums={mediums}
              isLoading={isMediumsLoading}
              selectedMediumIds={mediumSelection.selectedMediumIds}
              onMediumToggle={mediumSelection.toggleMedium}
              disabled={mediumSelection.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </aside>
  );
}
