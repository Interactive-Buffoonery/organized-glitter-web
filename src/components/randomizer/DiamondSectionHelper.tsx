import { useId, useState } from 'react';
import { Dice5 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RandomizerSection, RandomizerTarget } from '@/types/randomizer';
import { DiamondSectionSizePicker, type SectionSizeDraft } from './DiamondSectionSizePicker';
import { NumberSectionPicker } from './NumberSectionPicker';

interface DiamondSectionHelperProps {
  target: RandomizerTarget;
  section: RandomizerSection | null;
  onSectionChange: (section: RandomizerSection) => void | Promise<void>;
}

export function DiamondSectionHelper({
  target,
  section,
  onSectionChange,
}: DiamondSectionHelperProps) {
  const modeId = useId();
  const [sizeDraft, setSizeDraft] = useState<SectionSizeDraft>(() => ({
    selectedPresets: new Set(['3', '4', '5']),
    customWidth: '4',
    customHeight: '4',
  }));
  const [numbers, setNumbers] = useState(() =>
    section?.kind === 'number' ? section.candidates.join(', ') : ''
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isPickingSize, setIsPickingSize] = useState(false);
  const [pickMode, setPickMode] = useState<'size' | 'number'>(
    section?.kind === 'number' ? 'number' : 'size'
  );

  if (!isOpen) {
    return (
      <div className="border-border/60 space-y-3 border-t pt-4">
        <h3 className="text-foreground text-sm font-semibold">Want to pick a section?</h3>
        <Button type="button" variant="glass" size="sm" onClick={() => setIsOpen(true)}>
          <Dice5 className="mr-2 size-4" />
          Pick a section
        </Button>
      </div>
    );
  }

  return (
    <div className="border-border/60 space-y-4 border-t pt-4">
      <h3 className="text-sm font-semibold">Pick a section</h3>
      <fieldset>
        <legend className="sr-only">Pick by</legend>
        <div className="flex gap-6">
          {(['size', 'number'] as const).map(value => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium"
            >
              <input
                type="radio"
                name={modeId}
                value={value}
                checked={pickMode === value}
                disabled={isPickingSize}
                className="accent-primary size-4"
                onChange={() => setPickMode(value)}
              />
              {value === 'size' ? 'Size' : 'Number'}
            </label>
          ))}
        </div>
      </fieldset>
      {pickMode === 'number' ? (
        <NumberSectionPicker
          numbers={numbers}
          onNumbersChange={setNumbers}
          section={section?.kind === 'number' ? section : null}
          onSectionChange={onSectionChange}
        />
      ) : (
        <DiamondSectionSizePicker
          draft={sizeDraft}
          onDraftChange={setSizeDraft}
          target={target}
          section={section?.kind === 'number' ? null : section}
          onSectionChange={onSectionChange}
          isPicking={isPickingSize}
          setIsPicking={setIsPickingSize}
        />
      )}
    </div>
  );
}
