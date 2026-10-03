import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AppRouterError } from '../AppRouterError';

vi.mock('@/utils/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));

describe('AppRouterError', () => {
  it('waits for the root to become interactive before focusing the heading', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('inert', '');
    document.body.append(root);
    const router = createMemoryRouter([
      {
        path: '/',
        loader: () => {
          throw new Error('Page unavailable');
        },
        element: <main />,
        hydrateFallbackElement: <main />,
        errorElement: <AppRouterError />,
      },
    ]);
    const view = render(<RouterProvider router={router} />, { container: root });
    try {
      const heading = await screen.findByRole('heading', { level: 1 });
      expect(heading).not.toHaveFocus();
      root.removeAttribute('inert');
      await waitFor(() => expect(heading).toHaveFocus());
    } finally {
      view.unmount();
      router.dispose();
      root.remove();
    }
  });

  it('moves focus from the navigation link to the route error heading', async () => {
    const router = createMemoryRouter([
      { path: '/', element: <Link to="/broken">Open page</Link> },
      {
        path: '/broken',
        loader: () => {
          throw new Error('Page unavailable');
        },
        element: <main />,
        errorElement: <AppRouterError />,
      },
    ]);
    render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByRole('link', { name: 'Open page' }));

    expect(await screen.findByRole('heading', { level: 1 })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeEnabled();
    router.dispose();
  });
});
