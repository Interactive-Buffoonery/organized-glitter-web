import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FallbackImage from '../FallbackImage';

describe('FallbackImage', () => {
  it('keeps development diagnostics outside the image semantic', () => {
    render(
      <FallbackImage
        alt="Missing project cover"
        originalUrl="https://example.test/missing.jpg"
        error="Failed to load"
      />
    );

    const image = screen.getByRole('img', { name: 'Fallback image for: Missing project cover' });
    const diagnostics = screen.getByText('Debug').closest('details');

    expect(image).not.toContainElement(diagnostics);
  });
});
