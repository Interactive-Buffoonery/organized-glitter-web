import { useId, useState } from 'react';
import { Dice5 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RandomizerSection } from '@/types/randomizer';
import { createLogger } from '@/utils/logger';

const logger = createLogger('NumberSectionPicker');
type NumberSection = Extract<RandomizerSection, { kind: 'number' }>;

export function NumberSectionPicker({
  numbers,
  onNumbersChange,
  section,
  onSectionChange,
}: {
  numbers: string;
  onNumbersChange: (value: string) => void;
  section: NumberSection | null;
  onSectionChange: (section: RandomizerSection) => void | Promise<void>;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const pickNumber = async () => {
    const tokens = numbers.trim().split(/[\s,]+/);
    if (
      tokens.some(
        token => !/^\d+$/.test(token) || !Number.isSafeInteger(Number(token)) || Number(token) < 1
      )
    ) {
      setError('Enter whole numbers greater than zero, separated by commas.');
      return;
    }
    const candidates = [...new Set(tokens.map(Number))];
    setError(null);
    setIsSaving(true);
    try {
      await onSectionChange({
        kind: 'number',
        number: candidates[Math.floor(Math.random() * candidates.length)],
        candidates,
      });
    } catch (saveError) {
      logger.error('Failed to save section number', saveError);
      setError('Could not save that number. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={id}>Numbers to pick from</Label>
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          Enter your section numbers, separated by commas.
        </p>
        <Input
          id={id}
          value={numbers}
          placeholder="2, 5, 8, 12"
          disabled={isSaving}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
          aria-invalid={!!error}
          onChange={event => {
            onNumbersChange(event.target.value);
            setError(null);
          }}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      )}
      {section && (
        <p role="status" className="text-sm">
          Number picked: <strong>{section.number}</strong>
        </p>
      )}
      <Button
        type="button"
        variant="glass"
        size="sm"
        disabled={isSaving}
        onClick={() => void pickNumber()}
      >
        <Dice5 className="mr-2 size-4" />
        {isSaving ? 'Picking...' : section ? 'Try again' : 'Pick number'}
      </Button>
    </div>
  );
}
