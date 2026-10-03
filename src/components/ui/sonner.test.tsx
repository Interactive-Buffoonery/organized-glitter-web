import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sonnerMock, useThemeMock } = vi.hoisted(() => ({
  sonnerMock: vi.fn(() => <div data-testid="sonner-toaster" />),
  useThemeMock: vi.fn(() => ({ resolvedTheme: 'dark' as const, theme: 'dark' })),
}));

vi.mock('next-themes', () => ({
  useTheme: useThemeMock,
}));

vi.mock('sonner', () => ({
  Toaster: sonnerMock,
}));

import { Toaster } from './sonner';

describe('Toaster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useThemeMock.mockReturnValue({ resolvedTheme: 'dark' as const, theme: 'dark' });
  });

  it('configures readable toast surfaces and a lightweight close icon', () => {
    render(<Toaster />);

    expect(sonnerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        closeButton: true,
        position: 'top-right',
        richColors: false,
        theme: 'dark',
        toastOptions: expect.objectContaining({
          classNames: expect.objectContaining({
            toast: expect.stringContaining('!bg-card'),
            info: expect.stringContaining('!bg-card'),
            success: expect.stringContaining('!bg-emerald-50'),
            warning: expect.stringContaining('!bg-amber-50'),
            error: expect.stringContaining('!bg-destructive'),
            closeButton: expect.stringContaining('!bg-transparent'),
            description: expect.stringContaining('!text-muted-foreground'),
          }),
        }),
      }),
      undefined
    );

    const props = sonnerMock.mock.calls[0][0];
    expect(props.toastOptions.classNames.closeButton).not.toContain('rounded-full');
    expect(props.toastOptions.classNames.closeButton).toContain('!border-0');
    expect(props.toastOptions.classNames.closeButton).toContain('!shadow-none');
    expect(props.icons.close).toBeTruthy();
  });

  it('maps a legacy Catppuccin Latte preference to Sonner light mode', () => {
    useThemeMock.mockReturnValue({ resolvedTheme: 'catppuccin-latte', theme: 'catppuccin-latte' });

    render(<Toaster />);

    expect(sonnerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'light' }),
      undefined
    );
  });

  it('maps a legacy dark Catppuccin preference to Sonner dark mode', () => {
    useThemeMock.mockReturnValue({
      resolvedTheme: 'catppuccin-frappe',
      theme: 'catppuccin-frappe',
    });

    render(<Toaster />);

    expect(sonnerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'dark' }),
      undefined
    );
  });
});
