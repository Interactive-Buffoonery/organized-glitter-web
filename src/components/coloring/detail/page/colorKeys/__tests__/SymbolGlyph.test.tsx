import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SymbolGlyph } from '../SymbolGlyph';

vi.mock('@/components/image/PrivateFileImage', () => ({
  PrivateFileImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

describe('SymbolGlyph', () => {
  it('renders Unicode with text presentation and a readable name', () => {
    render(<SymbolGlyph symbol="u:2665" />);
    const glyph = screen.getByRole('img', { name: '♥' });
    expect(glyph).toHaveTextContent('♥︎');
  });

  it('draws catalog custom shapes as a stroked path', () => {
    const { container } = render(<SymbolGlyph symbol="c:linked-circles" />);
    expect(screen.getByRole('img', { name: 'Linked circles' })).toBeInTheDocument();
    const path = container.querySelector('svg path');
    expect(path).toHaveAttribute('d', expect.stringMatching(/^M4 12/));
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'none');
  });

  it('shows a neutral box for an unknown custom shape', () => {
    const { container } = render(<SymbolGlyph symbol="c:not-in-catalog" />);
    expect(screen.getByRole('img', { name: 'Unknown symbol' })).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('shows a sent symbol photo, labeled by its description', () => {
    render(
      <SymbolGlyph
        symbol="r:abcdefghijklmno"
        request={{ description: 'Two ws', thumbnail: 'https://pb/thumb.jpg' }}
      />
    );
    expect(screen.getByRole('img', { name: 'Two ws' })).toHaveAttribute(
      'src',
      'https://pb/thumb.jpg'
    );
  });

  it('falls back to the neutral box when a sent symbol cannot be read', () => {
    const { container } = render(<SymbolGlyph symbol="r:abcdefghijklmno" />);
    expect(screen.getByRole('img', { name: 'Sent symbol' })).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
