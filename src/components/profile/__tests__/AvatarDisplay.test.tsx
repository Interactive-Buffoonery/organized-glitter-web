import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AvatarDisplay from '../AvatarDisplay';
import { PrivateFileTokenContext } from '@/contexts/privateFileTokenState';
import { getContrastRatio } from '@/components/randomizer/randomizerWheelColors';
import { AVATAR_COLORS } from '@/types/avatar';

vi.mock('@/lib/pocketbase', () => ({
  pb: { baseUrl: 'https://pb.example', authStore: { record: { id: 'user-1' } } },
}));

describe('AvatarDisplay', () => {
  it.each(AVATAR_COLORS.map((backgroundColor, colorIndex) => ({ backgroundColor, colorIndex })))(
    'uses a readable foreground for avatar color $backgroundColor',
    ({ backgroundColor, colorIndex }) => {
      render(
        <AvatarDisplay
          config={{ type: 'initials', initials: 'SW', colorIndex }}
          fallbackInitials="U"
        />
      );

      const avatar = screen.getByText('SW');
      expect(avatar).toHaveStyle({
        backgroundColor,
      });
      const foreground = avatar.style.color
        .match(/[\d.]+/g)
        ?.map(Number)
        .map(channel => Math.round(channel).toString(16).padStart(2, '0'))
        .join('');
      expect(foreground).toBeDefined();
      expect(getContrastRatio(`#${foreground}`, backgroundColor)).toBeGreaterThanOrEqual(4.5);

      if (colorIndex === 3) expect(avatar).toHaveStyle({ color: '#211827' });
      if (colorIndex === 7) expect(avatar).toHaveStyle({ color: '#ffffff' });
    }
  );

  it.each([-1, AVATAR_COLORS.length])(
    'falls back safely for persisted color index %s',
    colorIndex => {
      render(<AvatarDisplay config={{ type: 'initials', initials: 'SW', colorIndex }} />);

      expect(screen.getByText('SW')).toHaveStyle({
        backgroundColor: AVATAR_COLORS[0],
        color: '#211827',
      });
    }
  );

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
