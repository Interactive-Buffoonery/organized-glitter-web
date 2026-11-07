import { useState } from 'react';

/**
 * Blocks a Radix Select without the native `disabled` attribute, which would drop keyboard focus
 * from the trigger when a save starts.
 */
export function useAriaDisabledSelect<T extends string>(
  disabled: boolean,
  onChange: (value: T) => void
) {
  const [open, setOpen] = useState(false);
  if (disabled && open) setOpen(false);
  return {
    selectProps: {
      open,
      onOpenChange: (next: boolean) => setOpen(next && !disabled),
      onValueChange: (value: string) => {
        if (!disabled) onChange(value as T);
      },
    },
    triggerProps: { 'aria-disabled': disabled },
  };
}
