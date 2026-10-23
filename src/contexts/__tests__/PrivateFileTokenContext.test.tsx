import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { PrivateFileTokenProvider } from '@/contexts/PrivateFileTokenContext';

const mocks = vi.hoisted(() => ({
  userId: 'owner',
  record: { id: 'owner' } as { id: string } | null,
  getToken: vi.fn<() => Promise<string>>(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }),
}));

vi.mock('@/lib/pocketbase', () => ({
  pb: {
    baseUrl: 'https://pb.example',
    files: { getToken: mocks.getToken },
    authStore: {
      get record() {
        return mocks.record;
      },
    },
  },
}));

const fileUrl = 'https://pb.example/api/files/projects/project-1/photo.jpg?thumb=160x160';

function renderImage() {
  return render(
    <PrivateFileTokenProvider>
      <PrivateFileImage src={fileUrl} alt="Private photo" />
    </PrivateFileTokenProvider>
  );
}

describe('private file URLs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.userId = 'owner';
    mocks.record = { id: 'owner' };
    mocks.getToken.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('never shows an old account token after an account switch', async () => {
    let resolveOldToken: (value: string) => void = () => {};
    mocks.getToken
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOldToken = resolve;
          })
      )
      .mockResolvedValueOnce('new-account-token');

    const view = renderImage();
    mocks.userId = 'second-account';
    mocks.record = { id: 'second-account' };
    view.rerender(
      <PrivateFileTokenProvider>
        <PrivateFileImage src={fileUrl} alt="Private photo" />
      </PrivateFileTokenProvider>
    );

    await act(async () => {
      resolveOldToken('old-account-token');
    });
    await act(async () => {});
    expect(screen.getByRole('img', { name: 'Private photo' }).getAttribute('src')).toBe(
      `${fileUrl}&token=new-account-token`
    );
  });

  it('refreshes one failed token for concurrent images and stops after a second failure', async () => {
    mocks.getToken
      .mockResolvedValueOnce('revoked-token')
      .mockResolvedValueOnce('replacement-token');
    render(
      <PrivateFileTokenProvider>
        <PrivateFileImage src={fileUrl} alt="First photo" />
        <PrivateFileImage src={fileUrl} alt="Second photo" />
      </PrivateFileTokenProvider>
    );
    await act(async () => {});

    fireEvent.error(screen.getByRole('img', { name: 'First photo' }));
    fireEvent.error(screen.getByRole('img', { name: 'Second photo' }));
    await act(async () => {});

    expect(mocks.getToken).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('img', { name: 'First photo' })).toHaveAttribute(
      'src',
      `${fileUrl}&token=replacement-token`
    );
    fireEvent.error(screen.getByRole('img', { name: 'First photo' }));
    await act(async () => {});
    expect(mocks.getToken).toHaveBeenCalledTimes(2);
  });

  it('uses a replacement from a pending scheduled refresh without fetching again', async () => {
    let resolvePending: (value: string) => void = () => {};
    const onError = vi.fn();
    mocks.getToken
      .mockResolvedValueOnce('revoked-token')
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolvePending = resolve;
          })
      )
      .mockRejectedValueOnce(new Error('unnecessary refresh failed'));
    render(
      <PrivateFileTokenProvider>
        <PrivateFileImage src={fileUrl} alt="Private photo" onError={onError} />
      </PrivateFileTokenProvider>
    );
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));

    await act(async () => resolvePending('replacement-token'));
    expect(mocks.getToken).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Private photo' })).toHaveAttribute(
      'src',
      `${fileUrl}&token=replacement-token`
    );
  });
});
