import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useNumberInput } from '../useNumberInput';

function NumberField() {
  const [value, setValue] = useState<number | null>(42);
  const handlers = useNumberInput(setValue);
  return <input aria-label="Quantity" type="number" value={value ?? ''} {...handlers} />;
}

const paste = (text: string) => {
  fireEvent.paste(screen.getByRole('spinbutton', { name: 'Quantity' }), {
    clipboardData: { getData: () => text },
  });
};

describe('useNumberInput', () => {
  it.each(['abc', 'Infinity', '-Infinity', '1e999'])(
    'preserves the number when pasting %s',
    text => {
      render(<NumberField />);
      paste(text);
      expect(screen.getByRole('spinbutton')).toHaveValue(42);
    }
  );

  it('accepts a comma-formatted finite number', () => {
    render(<NumberField />);
    paste('22,555');
    expect(screen.getByRole('spinbutton')).toHaveValue(22555);
  });

  it.each(['', '   '])('clears an empty pasted value %j', text => {
    render(<NumberField />);
    paste(text);
    expect(screen.getByRole('spinbutton')).toHaveValue(null);
  });
});
