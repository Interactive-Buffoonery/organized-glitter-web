import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ImageUpload } from '../ImageUpload';

describe('ImageUpload status', () => {
  it('keeps one mounted status that announces the selected filename', () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:photo'),
      revokeObjectURL: vi.fn(),
    });
    const imageFile = new File(['photo'], 'progress.jpg', { type: 'image/jpeg' });

    const { rerender } = render(
      <ImageUpload
        imageFile={null}
        statusText={null}
        isCompressing={false}
        compressionProgress={null}
        disabled={false}
        onChange={vi.fn()}
        onClearImage={vi.fn()}
      />
    );

    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();

    rerender(
      <ImageUpload
        imageFile={imageFile}
        statusText={null}
        isCompressing={false}
        compressionProgress={null}
        disabled={false}
        onChange={vi.fn()}
        onClearImage={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toBe(status);
    expect(status).toBeEmptyDOMElement();

    rerender(
      <ImageUpload
        imageFile={imageFile}
        statusText={`Photo selected: ${imageFile.name}`}
        isCompressing={false}
        compressionProgress={null}
        disabled={false}
        onChange={vi.fn()}
        onClearImage={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Remove image' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBe(status);
    expect(status.textContent?.trim()).toBeTruthy();
    expect(status).toHaveTextContent(imageFile.name);
  });
});
