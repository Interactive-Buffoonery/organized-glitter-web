import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/button';

describe('Button asChild touch targets', () => {
  it('sizes compact links for coarse pointers while keeping their focus treatment', () => {
    render(
      <Button asChild variant="ghost" size="icon-sm">
        <a href="/coloring" aria-label="Back to coloring">
          Back
        </a>
      </Button>
    );

    const link = screen.getByRole('link', { name: 'Back to coloring' });
    expect(link).toHaveClass('pointer-coarse:min-h-11', 'pointer-coarse:min-w-11');
    expect(link).toHaveClass('focus-visible:ring-[3px]');
    expect(link).toHaveClass('size-8');
  });

  it('allows a caller to request a larger coarse-pointer target', () => {
    render(
      <Button asChild size="sm" className="pointer-coarse:min-h-12">
        <a href="/dashboard">Library</a>
      </Button>
    );

    const link = screen.getByRole('link', { name: 'Library' });
    expect(link).toHaveClass('pointer-coarse:min-h-12', 'pointer-coarse:min-w-11');
    expect(link).not.toHaveClass('pointer-coarse:min-h-11');
  });
});
