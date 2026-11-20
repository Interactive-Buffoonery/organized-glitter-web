import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AvatarDisplay from '../AvatarDisplay';

vi.mock('@/components/image/PrivateFileImage', () => ({
  PrivateFileImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt} />
  ),
}));

describe('uploaded avatar loading', () => {
  it('restores initials while a replacement avatar loads', () => {
    const config = {
      type: 'upload' as const,
      uploadUrl: 'https://example.com/avatar.jpg',
      initials: 'AB',
    };
    const { rerender } = render(<AvatarDisplay config={config} />);
    fireEvent.load(screen.getByAltText('User avatar'));
    expect(screen.getByText('AB')).not.toBeVisible();

    rerender(
      <AvatarDisplay config={{ ...config, uploadUrl: 'https://example.com/new-avatar.jpg' }} />
    );
    expect(screen.getByText('AB')).toBeVisible();
    expect(screen.getByAltText('User avatar')).not.toBeVisible();
  });

  it('shows initials until the image loads', () => {
    render(
      <AvatarDisplay
        config={{
          type: 'upload',
          uploadUrl: 'https://example.com/avatar.jpg',
          initials: 'AB',
          colorIndex: 0,
        }}
      />
    );
    const image = screen.getByAltText('User avatar');
    expect(screen.getByText('AB')).toBeVisible();
    expect(image).not.toBeVisible();
    fireEvent.load(image);
    expect(image).toBeVisible();
    expect(screen.getByText('AB')).not.toBeVisible();
    fireEvent.error(image);
    expect(screen.getByText('AB')).toBeVisible();
  });
});
