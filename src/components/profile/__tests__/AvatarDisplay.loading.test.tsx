import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AvatarDisplay from '../AvatarDisplay';

vi.mock('@/components/image/PrivateFileImage', () => ({
  PrivateFileImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt} />
  ),
}));

describe('uploaded avatar loading', () => {
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
