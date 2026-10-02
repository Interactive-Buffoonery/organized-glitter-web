import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AvatarDisplay from '../AvatarDisplay';
import { PrivateFileTokenContext } from '@/contexts/privateFileTokenState';

vi.mock('@/lib/pocketbase', () => ({
  pb: { baseUrl: 'https://pb.example', authStore: { record: { id: 'user-1' } } },
}));

describe('AvatarDisplay', () => {
  it('keeps an uploaded avatar mounted while its file token is pending', () => {
    const config = {
      type: 'upload' as const,
      uploadUrl: 'https://pb.example/api/files/users/user-1/avatar.jpg',
      initials: 'SW',
    };
    const { rerender } = render(<AvatarDisplay config={config} />);

    expect(screen.getByRole('img', { name: 'User avatar' })).not.toHaveAttribute('src');
    expect(screen.queryByText('SW')).not.toBeVisible();

    rerender(
      <PrivateFileTokenContext.Provider
        value={{ userId: 'user-1', value: 'private-token', issuedAt: Date.now() }}
      >
        <AvatarDisplay config={config} />
      </PrivateFileTokenContext.Provider>
    );

    expect(screen.getByRole('img', { name: 'User avatar' })).toHaveAttribute(
      'src',
      `${config.uploadUrl}?token=private-token`
    );
  });

  it('shows the uploaded avatar again after a failed request recovers', () => {
    render(
      <AvatarDisplay
        config={{ type: 'upload', uploadUrl: 'https://pb.example/avatar.jpg', initials: 'SW' }}
      />
    );
    const image = screen.getByRole('img', { name: 'User avatar' });
    fireEvent.error(image);
    expect(image).not.toBeVisible();
    expect(screen.getByText('SW')).toBeVisible();
    fireEvent.load(image);
    expect(image).toBeVisible();
    expect(screen.getByText('SW')).not.toBeVisible();
  });
});
