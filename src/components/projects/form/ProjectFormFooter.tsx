import { Button } from '@/components/ui/button';

interface ProjectFormFooterProps {
  submitting: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  saveButtonId?: string;
  submitLabel: string;
  submittingLabel: string;
}

export const ProjectFormFooter = ({
  submitting,
  disabled = false,
  onCancel,
  onSubmit,
  saveButtonId,
  submitLabel,
  submittingLabel,
}: ProjectFormFooterProps) => (
  <div className="border-border lg:bg-background/95 mt-6 border-t pt-4 pb-4 lg:sticky lg:bottom-0 lg:z-10 lg:pb-[calc(1rem+env(safe-area-inset-bottom))] lg:backdrop-blur">
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
        Cancel
      </Button>
      <Button
        id={saveButtonId}
        type="button"
        variant="glass"
        onClick={onSubmit}
        disabled={submitting || disabled}
      >
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </div>
  </div>
);
