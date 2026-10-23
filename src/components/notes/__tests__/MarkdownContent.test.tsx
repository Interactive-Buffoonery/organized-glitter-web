import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MarkdownContent from '../MarkdownContent';

describe('MarkdownContent', () => {
  it('does not render raw HTML from note content', () => {
    render(<MarkdownContent content={'<img src=x onerror=alert(1)>Safe text'} />);

    expect(screen.getByText(/Safe text/)).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('removes unsafe link destinations', () => {
    render(<MarkdownContent content="[Bad link](javascript:alert(1))" />);

    const linkText = screen.getByText('Bad link');

    expect(linkText.closest('a')).toBeNull();
  });
});
