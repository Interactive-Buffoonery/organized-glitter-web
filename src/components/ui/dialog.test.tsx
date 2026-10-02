import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from './dialog';

describe('DialogContent', () => {
  it('uses centered positioning by default', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Default dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByRole('dialog')).toHaveClass('translate-y-[-50%]');
    expect(screen.getByRole('dialog')).not.toHaveClass('keyboard-safe-dialog-content');
  });

  it('uses compact keyboard-safe positioning without Tailwind individual translate utilities', () => {
    render(
      <Dialog open>
        <DialogContent layout="keyboard-safe">
          <DialogTitle>Keyboard-safe dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog');
    const classes = dialog.className.split(/\s+/);

    expect(dialog).toHaveClass('keyboard-safe-dialog-content');
    expect(dialog).toHaveClass('top-[50%]');
    expect(dialog).toHaveClass('left-[50%]');
    expect(dialog).not.toHaveClass('inset-0');
    expect(dialog).not.toHaveClass('h-[100dvh]');
    expect(classes).not.toContain('translate-x-[-50%]');
    expect(classes).not.toContain('translate-y-[-50%]');
    expect(classes).not.toContain('sm:translate-y-[-50%]');
  });

  it('uses a full-height mobile sheet only when explicitly requested', () => {
    render(
      <Dialog open>
        <DialogContent layout="keyboard-safe-sheet">
          <DialogTitle>Keyboard-safe sheet dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog');
    const classes = dialog.className.split(/\s+/);

    expect(dialog).toHaveClass('keyboard-safe-sheet-dialog-content');
    expect(dialog).toHaveClass('inset-0');
    expect(dialog).toHaveClass('h-[100dvh]');
    expect(classes).not.toContain('translate-x-[-50%]');
    expect(classes).not.toContain('translate-y-[-50%]');
    expect(classes).not.toContain('sm:translate-y-[-50%]');
  });

  it('injects a glass icon close button by default', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Solid dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const closeButton = screen.getByRole('button', { name: 'Close' });
    expect(closeButton).toHaveAttribute('data-variant', 'glass');
    expect(closeButton).toHaveAttribute('data-size', 'icon-sm');
    expect(closeButton).toHaveClass('absolute', 'top-4', 'right-4', 'pointer-coarse:size-11');
  });

  it('omits the injected close button when showCloseButton is false', () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Media dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });
});
