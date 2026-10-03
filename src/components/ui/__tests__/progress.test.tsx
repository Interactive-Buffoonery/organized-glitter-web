import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Progress } from '../progress';

describe('Progress', () => {
  it('exposes its displayed value and accessible name', () => {
    render(<Progress value={37} aria-label="Import progress" />);

    expect(screen.getByRole('progressbar', { name: 'Import progress' })).toHaveAttribute(
      'aria-valuenow',
      '37'
    );
  });

  it('preserves a custom maximum when exposing its value', () => {
    render(<Progress value={50} max={200} aria-label="Restore progress" />);

    expect(screen.getByRole('progressbar', { name: 'Restore progress' })).toHaveAttribute(
      'aria-valuenow',
      '50'
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '200');
  });

  it('keeps an indeterminate progress bar indeterminate', () => {
    render(<Progress value={null} aria-label="Working" />);

    expect(screen.getByRole('progressbar', { name: 'Working' })).not.toHaveAttribute(
      'aria-valuenow'
    );
  });
});
