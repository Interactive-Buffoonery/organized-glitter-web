import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectImageDropzone } from '../ProjectImageDropzone';
import { PrivateFileTokenContext } from '@/contexts/privateFileTokenState';

vi.mock('@/lib/pocketbase', () => ({
  pb: { baseUrl: 'https://pb.example', authStore: { record: { id: 'user-1' } } },
}));

describe('ProjectImageDropzone', () => {
  it('keeps a fallback until the protected image token or URL changes', () => {
    const imageUrl = 'https://pb.example/api/files/projects/project-1/image.jpg';
    const props = {
      imageUrl,
      isUploading: false,
      onImageChange: vi.fn(),
      onImageRemove: vi.fn(),
    };
    const renderWithToken = (token: string, url = imageUrl) => (
      <PrivateFileTokenContext.Provider
        value={{ userId: 'user-1', value: token, issuedAt: Date.now() }}
      >
        <ProjectImageDropzone {...props} imageUrl={url} />
      </PrivateFileTokenContext.Provider>
    );
    const { rerender } = render(renderWithToken('first-token'));
    const preview = screen.getByRole('img', { name: 'Project preview' });

    expect(preview).toHaveAttribute('src', `${imageUrl}?token=first-token`);
    fireEvent.error(preview);
    expect(preview).toHaveAttribute(
      'src',
      'https://placehold.co/1200x900/f1f5f9/64748b?text=Error'
    );

    fireEvent.load(preview);
    expect(preview).toHaveAttribute(
      'src',
      'https://placehold.co/1200x900/f1f5f9/64748b?text=Error'
    );

    rerender(renderWithToken('first-token'));
    expect(preview).toHaveAttribute(
      'src',
      'https://placehold.co/1200x900/f1f5f9/64748b?text=Error'
    );

    rerender(renderWithToken('second-token'));
    expect(preview).toHaveAttribute('src', `${imageUrl}?token=second-token`);

    fireEvent.error(preview);
    expect(preview).toHaveAttribute(
      'src',
      'https://placehold.co/1200x900/f1f5f9/64748b?text=Error'
    );

    const replacementUrl = 'https://pb.example/api/files/projects/project-1/replacement.jpg';
    rerender(renderWithToken('second-token', replacementUrl));
    expect(preview).toHaveAttribute('src', `${replacementUrl}?token=second-token`);
  });
});
