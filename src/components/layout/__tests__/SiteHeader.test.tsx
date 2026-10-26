import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteHeader } from '../SiteHeader';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../AuthMenu', () => ({ AuthMenu: () => null }));
vi.mock('@/components/ui/theme-toggle', () => ({ ThemeToggle: () => null }));

describe('SiteHeader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty('--site-header-total-height');
  });

  it('publishes its measured height for bars that stick below it', () => {
    let resize = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    const { getByRole } = render(
      <MemoryRouter>
        <SiteHeader />
      </MemoryRouter>
    );
    const header = getByRole('banner');
    Object.defineProperty(header, 'offsetHeight', { configurable: true, value: 93 });
    resize();
    expect(document.documentElement.style.getPropertyValue('--site-header-total-height')).toBe(
      '93px'
    );
  });
});
