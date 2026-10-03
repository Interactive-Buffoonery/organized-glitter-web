import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { Dice5 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { RandomizerSection, RandomizerTarget } from '@/types/randomizer';
import { createLogger } from '@/utils/logger';

interface DiamondSectionSizePickerProps {
  draft: SectionSizeDraft;
  onDraftChange: Dispatch<SetStateAction<SectionSizeDraft>>;
  target: RandomizerTarget;
  section: Exclude<RandomizerSection, { kind: 'number' }> | null;
  onSectionChange: (section: RandomizerSection) => void | Promise<void>;
  isPicking: boolean;
  setIsPicking: Dispatch<SetStateAction<boolean>>;
}

type Preset = '3' | '4' | '5' | 'custom';

export interface SectionSizeDraft {
  selectedPresets: Set<Preset>;
  customWidth: string;
  customHeight: string;
}

const PRESETS: Array<{ value: Preset; label: string; width: number; height: number }> = [
  { value: '3', label: '3 x 3', width: 3, height: 3 },
  { value: '4', label: '4 x 4', width: 4, height: 4 },
  { value: '5', label: '5 x 5', width: 5, height: 5 },
  { value: 'custom', label: 'Custom', width: 0, height: 0 },
];

const logger = createLogger('DiamondSectionSizePicker');
const REROLL_DELAY_MS = 3000;

function estimateDiamonds(target: RandomizerTarget, widthCm: number, heightCm: number) {
  if (!target.width || !target.height || !target.totalDiamonds) return undefined;
  const canvasArea = target.width * target.height;
  if (canvasArea <= 0) return undefined;
  return Math.round(((widthCm * heightCm) / canvasArea) * target.totalDiamonds);
}

export function DiamondSectionSizePicker({
  draft,
  onDraftChange,
  target,
  section,
  onSectionChange,
  isPicking,
  setIsPicking,
}: DiamondSectionSizePickerProps) {
  const { selectedPresets, customWidth, customHeight } = draft;
  const [error, setError] = useState<string | null>(null);
  const rerollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (rerollTimeoutRef.current) {
        clearTimeout(rerollTimeoutRef.current);
        rerollTimeoutRef.current = null;
      }
    };
  }, [target.id]);

  const dimensionsMissing = !target.width || !target.height;

  const customSelected = selectedPresets.has('custom');

  const selectedSizes = useMemo(() => {
    return PRESETS.filter(item => selectedPresets.has(item.value));
  }, [selectedPresets]);

  const togglePreset = (value: Preset) => {
    onDraftChange(current => {
      const next = new Set(current.selectedPresets);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return { ...current, selectedPresets: next };
    });
    setError(null);
  };

  const saveSelectedSection = async (selected: { width: number; height: number }) => {
    try {
      await onSectionChange({
        widthCm: selected.width,
        heightCm: selected.height,
        estimatedDiamonds: estimateDiamonds(target, selected.width, selected.height),
      });
    } catch (changeError) {
      logger.error('Failed to update randomizer section', changeError);
      setError('Could not save that section size. Try again.');
    } finally {
      setIsPicking(false);
    }
  };

  const handlePickSize = ({ delay = false }: { delay?: boolean } = {}) => {
    if (isPicking || dimensionsMissing) return;

    if (selectedSizes.length === 0) {
      setError('Select at least one section size to pick.');
      return;
    }

    const customWidthNumber = Number(customWidth);
    const customHeightNumber = Number(customHeight);

    if (
      customSelected &&
      (!Number.isFinite(customWidthNumber) ||
        !Number.isFinite(customHeightNumber) ||
        customWidthNumber <= 0 ||
        customHeightNumber <= 0)
    ) {
      setError('Custom section size must be greater than zero.');
      return;
    }

    if (
      customSelected &&
      (customWidthNumber > target.width! || customHeightNumber > target.height!)
    ) {
      setError('Custom section size must fit inside the project dimensions.');
      return;
    }

    const candidates = selectedSizes.reduce<Array<{ width: number; height: number }>>(
      (sizes, item) => {
        const candidate =
          item.value === 'custom'
            ? { width: customWidthNumber, height: customHeightNumber }
            : { width: item.width, height: item.height };
        const isDuplicate = sizes.some(
          size => size.width === candidate.width && size.height === candidate.height
        );

        return isDuplicate ? sizes : [...sizes, candidate];
      },
      []
    );

    const fitCandidates = candidates.filter(
      candidate => candidate.width <= target.width! && candidate.height <= target.height!
    );

    if (fitCandidates.length === 0) {
      setError('Selected section sizes must fit inside the project dimensions.');
      return;
    }

    setError(null);
    setIsPicking(true);
    if (delay) {
      rerollTimeoutRef.current = setTimeout(() => {
        rerollTimeoutRef.current = null;
        const selected = fitCandidates[Math.floor(Math.random() * fitCandidates.length)];
        void saveSelectedSection(selected);
      }, REROLL_DELAY_MS);
      return;
    }

    const selected = fitCandidates[Math.floor(Math.random() * fitCandidates.length)];
    void saveSelectedSection(selected);
  };

  return (
    <div className="space-y-4">
      {dimensionsMissing ? (
        <div className="border-border/70 rounded-lg border border-dashed p-4">
          <p className="text-muted-foreground text-sm">
            Add canvas dimensions to pick section sizes.
          </p>
          <Button asChild variant="link" size="sm" className="mt-2 px-0">
            <Link to={`/projects/${target.id}/edit`}>Edit project dimensions</Link>
          </Button>
        </div>
      ) : (
        <>
          <fieldset>
            <legend className="text-muted-foreground mb-2 text-sm">
              Choose the sizes the randomizer can pick.
            </legend>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(item => (
                <label
                  key={item.value}
                  className="flex min-h-11 cursor-pointer items-center gap-2 pr-4 text-sm font-medium has-disabled:cursor-not-allowed has-disabled:opacity-50"
                >
                  <Checkbox
                    disabled={isPicking}
                    checked={selectedPresets.has(item.value)}
                    onCheckedChange={() => togglePreset(item.value)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>

          {customSelected && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="section-width">Width in cm</Label>
                <Input
                  id="section-width"
                  type="number"
                  min="0"
                  step="0.1"
                  value={customWidth}
                  disabled={isPicking}
                  onChange={event => {
                    const customWidth = event.target.value;
                    onDraftChange(current => ({ ...current, customWidth }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="section-height">Height in cm</Label>
                <Input
                  id="section-height"
                  type="number"
                  min="0"
                  step="0.1"
                  value={customHeight}
                  disabled={isPicking}
                  onChange={event => {
                    const customHeight = event.target.value;
                    onDraftChange(current => ({ ...current, customHeight }));
                  }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-destructive-text text-sm">{error}</p>}
          <span role="status" className="sr-only">
            {isPicking ? 'Picking section size...' : ''}
          </span>

          {section && (
            <div className="border-border/60 space-y-3 rounded-lg border p-4">
              <div>
                <p className="text-muted-foreground text-sm">Size randomly picked:</p>
                <p className="text-sm font-semibold">
                  {section.widthCm} x {section.heightCm} cm
                </p>
              </div>
              {section.estimatedDiamonds && (
                <p className="text-muted-foreground mt-1 text-sm">
                  Estimated diamonds (approx.): {section.estimatedDiamonds.toLocaleString()}
                </p>
              )}
              <Button
                type="button"
                variant="glass"
                size="sm"
                onClick={() => handlePickSize({ delay: true })}
                disabled={isPicking}
              >
                <Dice5 className="mr-2 size-4" />
                {isPicking ? 'Picking...' : 'Try again'}
              </Button>
            </div>
          )}

          {!section && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="glass"
                size="sm"
                onClick={() => handlePickSize()}
                disabled={isPicking}
              >
                <Dice5 className="mr-2 size-4" />
                {isPicking ? 'Picking...' : 'Pick size'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
