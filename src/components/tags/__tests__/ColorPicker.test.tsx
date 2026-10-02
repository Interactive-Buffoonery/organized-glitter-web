import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';

import { ColorPicker } from '../ColorPicker';

const colors = ['#ff0000', '#00ff00', '#0000ff'];

describe('ColorPicker', () => {
  it('exposes color swatches as a named toggle-button group', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <ColorPicker value="#00ff00" onChange={onChange} colors={colors} />
    );

    expect(screen.getByRole('group', { name: 'Tag color' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);

    expect(screen.getByRole('button', { name: 'Select color #00ff00' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Select color #ff0000' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    await expect(await axe(container)).toHaveNoViolations();
  });

  it('calls onChange when a color swatch is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPicker value="#00ff00" onChange={onChange} colors={colors} />);

    await user.click(screen.getByRole('button', { name: 'Select color #0000ff' }));

    expect(onChange).toHaveBeenCalledWith('#0000ff');
  });
});
