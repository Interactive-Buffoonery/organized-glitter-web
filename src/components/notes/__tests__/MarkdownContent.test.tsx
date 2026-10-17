import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MarkdownContent from '../MarkdownContent';

describe('MarkdownContent', () => {
  it('renders plaintext notes as normal text', () => {
    render(<MarkdownContent content="A plain progress note" />);

    expect(screen.getByText('A plain progress note')).toBeInTheDocument();
  });

  it('renders escaped numbered paragraphs alongside legacy ordered lists', () => {
    const { container } = render(
      <MarkdownContent content={'1\\. Plain paragraph\n\n1. Explicit item\n\n2\\) Plain again'} />
    );

    expect(container.querySelectorAll('ol')).toHaveLength(1);
    expect(container.querySelector('ol > li')).toHaveTextContent('Explicit item');
    expect(screen.getByText('1. Plain paragraph').tagName).toBe('P');
    expect(screen.getByText('2) Plain again').tagName).toBe('P');
  });

  it('renders supported Markdown formatting', () => {
    render(<MarkdownContent content={'### Section\n\nA **bold** and ~~finished~~ note.'} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Section' })).toBeInTheDocument();
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getByText('finished')).toBeInTheDocument();
  });

  it('preserves single-line breaks from existing textarea notes', () => {
    const { container } = render(<MarkdownContent content={'First line\nSecond line'} />);

    expect(container).toHaveTextContent('First line');
    expect(container).toHaveTextContent('Second line');
    expect(container.querySelector('br')).toBeInTheDocument();
  });

  it('does not render raw HTML from note content', () => {
    render(<MarkdownContent content={'<img src=x onerror=alert(1)>Safe text'} />);

    expect(screen.getByText(/Safe text/)).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('does not render markdown image nodes', () => {
    render(<MarkdownContent content="![Tracking pixel](https://example.com/pixel.png)" />);

    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('removes unsafe link destinations', () => {
    render(<MarkdownContent content="[Bad link](javascript:alert(1))" />);

    const linkText = screen.getByText('Bad link');

    expect(linkText.closest('a')).toBeNull();
  });
});
