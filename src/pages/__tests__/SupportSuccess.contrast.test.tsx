import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { contrast, themeColor } from '@/test-utils/contrast';

vi.mock('@/hooks/useAppReady', () => ({ useAppReady: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

import SupportSuccess from '../SupportSuccess';

describe('SupportSuccess contact link', () => {
  it('uses the semantic link color with readable contrast in both themes', () => {
    vi.stubEnv('VITE_CONTACT_EMAIL', 'contact@example.test');
    render(
      <MemoryRouter>
        <SupportSuccess />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: 'reach out' });
    expect(link).toHaveClass('text-link');
    expect(link.className).not.toMatch(/hover:opacity/);
    const panel = link.closest('div');
    expect(panel).toHaveClass('bg-card');

    for (const theme of ['light', 'dark'] as const) {
      expect(contrast(themeColor(theme, 'link'), themeColor(theme, 'card'))).toBeGreaterThanOrEqual(
        4.5
      );
    }
  });
});
