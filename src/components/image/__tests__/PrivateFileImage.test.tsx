import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PrivateFileTokenContext } from '@/contexts/privateFileTokenState';
import { PrivateFileImage } from '../PrivateFileImage';

vi.mock('@/lib/pocketbase', () => ({
  pb: { baseUrl: 'https://pb.example', authStore: { record: { id: 'user-1' } } },
}));

describe('PrivateFileImage', () => {
  it('reports a malformed image URL and shows its fallback without refreshing the token', () => {
    const onError = vi.fn();
    const refreshOnError = vi.fn();
    render(
      <PrivateFileTokenContext.Provider
        value={{ userId: 'user-1', value: 'private-token', issuedAt: 0, refreshOnError }}
      >
        <PrivateFileImage
          src="http://["
          alt="Private photo"
          fallbackSrc="/fallback.png"
          onError={onError}
        />
      </PrivateFileTokenContext.Provider>
    );

    const image = screen.getByRole('img', { name: 'Private photo' });
    expect(image).toHaveAttribute('src', 'http://[');
    fireEvent.error(image);

    expect(onError).toHaveBeenCalledOnce();
    expect(refreshOnError).not.toHaveBeenCalled();
    expect(image).toHaveAttribute('src', '/fallback.png');
  });
});
