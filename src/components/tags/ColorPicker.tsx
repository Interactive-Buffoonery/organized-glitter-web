import { TAG_COLOR_PALETTE } from '@/utils/ui/tagColors';
import { cn } from '@/lib/utils';

export const TAG_COLORS = TAG_COLOR_PALETTE.map(color => color.hex);

interface ColorSwatchButtonProps {
  color: string;
  selected: boolean;
  onSelect: (color: string) => void;
  disabled?: boolean;
}

function ColorSwatchButton({ color, selected, onSelect, disabled }: ColorSwatchButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'focus-visible:ring-ring size-8 rounded-full border-2 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        selected ? 'border-foreground' : 'border-muted'
      )}
      style={{ backgroundColor: color }}
      onClick={() => onSelect(color)}
      disabled={disabled}
      aria-label={`Select color ${color}`}
      aria-pressed={selected}
    />
  );
}

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  colors?: readonly string[];
  disabled?: boolean;
  className?: string;
}

/**
 * A grid of color swatches the user can pick from. Defaults to the tag color
 * palette but accepts a custom `colors` array. Each swatch is a toggle button
 * with `aria-pressed`, focus ring, and disabled handling.
 */
export function ColorPicker({
  value,
  onChange,
  colors = TAG_COLORS,
  disabled,
  className,
}: ColorPickerProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="group" aria-label="Tag color">
      {colors.map(color => (
        <ColorSwatchButton
          key={color}
          color={color}
          selected={value === color}
          onSelect={onChange}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
