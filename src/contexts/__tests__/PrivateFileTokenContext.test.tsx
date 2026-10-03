import { useLayoutEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { PrivateFileTokenProvider } from '@/contexts/PrivateFileTokenContext';
import { PrivateFileTokenContext } from '@/contexts/privateFileTokenState';

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

  it('withholds a PocketBase image until a token exists and renews its cached URL', async () => {
    mocks.getToken.mockResolvedValueOnce('first-token').mockResolvedValueOnce('second-token');
    renderImage();

    expect(screen.getByRole('img', { name: 'Private photo' })).not.toHaveAttribute('src');
    await act(async () => {});
    expect(screen.getByRole('img', { name: 'Private photo' }).getAttribute('src')).toBe(
      `${fileUrl}&token=first-token`
    );

    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(screen.getByRole('img', { name: 'Private photo' }).getAttribute('src')).toBe(
      `${fileUrl}&token=second-token`
    );
  });

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

  it('withholds the image after a token failure and retries access', async () => {
    mocks.getToken
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce('recovered-token');
    renderImage();

    await act(async () => {});
    expect(screen.getByRole('img', { name: 'Private photo' })).not.toHaveAttribute('src');

    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole('img', { name: 'Private photo' }).getAttribute('src')).toBe(
      `${fileUrl}&token=recovered-token`
    );
  });

  it('keeps an already displayed image visible during a refresh failure', async () => {
    mocks.getToken
      .mockResolvedValueOnce('first-token')
      .mockRejectedValueOnce(new Error('network unavailable'));
    renderImage();
    await act(async () => {});

    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(screen.getByRole('img', { name: 'Private photo' }).getAttribute('src')).toBe(
      `${fileUrl}&token=first-token`
    );
  });

  it('keeps loaded images stable while new images use the renewed token', async () => {
    mocks.getToken.mockResolvedValueOnce('first-token').mockResolvedValueOnce('second-token');
    const view = renderImage();
    await act(async () => {});
    fireEvent.load(screen.getByRole('img', { name: 'Private photo' }));

    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(screen.getByRole('img', { name: 'Private photo' }).getAttribute('src')).toBe(
      `${fileUrl}&token=first-token`
    );

    view.rerender(
      <PrivateFileTokenProvider>
        <PrivateFileImage src={fileUrl} alt="Private photo" />
        <PrivateFileImage src={fileUrl} alt="New photo" />
      </PrivateFileTokenProvider>
    );
    expect(screen.getByRole('img', { name: 'New photo' }).getAttribute('src')).toBe(
      `${fileUrl}&token=second-token`
    );
  });

  it('retries a loaded image with an already renewed token before reporting failure', async () => {
    const onError = vi.fn();
    mocks.getToken.mockResolvedValueOnce('old-token').mockResolvedValueOnce('new-token');
    render(
      <PrivateFileTokenProvider>
        <PrivateFileImage src={fileUrl} alt="Private photo" onError={onError} />
      </PrivateFileTokenProvider>
    );
    await act(async () => {});
    fireEvent.load(screen.getByRole('img', { name: 'Private photo' }));
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(screen.getByRole('img', { name: 'Private photo' })).toHaveAttribute(
      'src',
      `${fileUrl}&token=old-token`
    );

    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Private photo' })).toHaveAttribute(
      'src',
      `${fileUrl}&token=new-token`
    );
    expect(mocks.getToken).toHaveBeenCalledTimes(2);
  });

  it('reports a failed retry even if its error arrives before refresh settles', async () => {
    let resolveRefresh: (value: string) => void = () => {};
    const onError = vi.fn();
    const refreshOnError = vi.fn(
      () =>
        new Promise<string>(resolve => {
          resolveRefresh = resolve;
        })
    );
    const view = render(
      <PrivateFileTokenContext.Provider
        value={{ userId: 'owner', value: 'old-token', issuedAt: 0, refreshOnError }}
      >
        <PrivateFileImage src={fileUrl} alt="Private photo" onError={onError} />
      </PrivateFileTokenContext.Provider>
    );
    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));
    view.rerender(
      <PrivateFileTokenContext.Provider
        value={{ userId: 'owner', value: 'new-token', issuedAt: 1, refreshOnError }}
      >
        <PrivateFileImage src={fileUrl} alt="Private photo" onError={onError} />
      </PrivateFileTokenContext.Provider>
    );
    expect(screen.getByRole('img', { name: 'Private photo' })).toHaveAttribute(
      'src',
      `${fileUrl}&token=new-token`
    );

    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));
    expect(onError).toHaveBeenCalledTimes(1);
    await act(async () => resolveRefresh('new-token'));
    expect(onError).toHaveBeenCalledTimes(1);
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

  it('keeps a destructive error callback pending until a replacement image fails', async () => {
    let resolveRefresh: (value: string) => void = () => {};
    const onError = vi.fn();
    mocks.getToken.mockResolvedValueOnce('revoked-token').mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveRefresh = resolve;
        })
    );
    render(
      <PrivateFileTokenProvider>
        <PrivateFileImage src={fileUrl} alt="Private photo" onError={onError} />
      </PrivateFileTokenProvider>
    );
    await act(async () => {});

    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));
    expect(onError).not.toHaveBeenCalled();
    await act(async () => resolveRefresh('replacement-token'));
    expect(screen.getByRole('img', { name: 'Private photo' })).toHaveAttribute(
      'src',
      `${fileUrl}&token=replacement-token`
    );
    expect(onError).not.toHaveBeenCalled();

    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it.each(['unchanged', 'failed'])('ends recovery when token refresh is %s', async outcome => {
    const onError = vi.fn();
    mocks.getToken.mockResolvedValueOnce('revoked-token');
    if (outcome === 'unchanged') mocks.getToken.mockResolvedValueOnce('revoked-token');
    else mocks.getToken.mockRejectedValueOnce(new Error('network unavailable'));
    render(
      <PrivateFileTokenProvider>
        <PrivateFileImage
          src={fileUrl}
          alt="Private photo"
          onError={onError}
          fallbackSrc="/placeholder.png"
        />
      </PrivateFileTokenProvider>
    );
    await act(async () => {});

    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));
    await act(async () => {});
    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: 'Private photo' })).toHaveAttribute(
      'src',
      '/placeholder.png'
    );
    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('ignores a pending recovery after the file changes', async () => {
    let resolveRefresh: (value: string) => void = () => {};
    const onError = vi.fn();
    mocks.getToken.mockResolvedValueOnce('revoked-token').mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveRefresh = resolve;
        })
    );
    const view = render(
      <PrivateFileTokenProvider>
        <PrivateFileImage src={fileUrl} alt="Private photo" onError={onError} />
      </PrivateFileTokenProvider>
    );
    await act(async () => {});
    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));

    const nextFile = fileUrl.replace('photo.jpg', 'next.jpg');
    view.rerender(
      <PrivateFileTokenProvider>
        <PrivateFileImage src={nextFile} alt="Private photo" onError={onError} />
      </PrivateFileTokenProvider>
    );
    await act(async () => resolveRefresh('replacement-token'));
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Private photo' })).toHaveAttribute(
      'src',
      `${nextFile}&token=replacement-token`
    );
  });

  it('ignores a failed refresh settled during a source-change commit', async () => {
    let settleRefresh = () => {};
    const onError = vi.fn();
    // Settle in the parent layout phase, before passive effect cleanup can run.
    const refreshOnError = vi.fn(
      () =>
        ({
          then(onSettled: (value: string) => void) {
            settleRefresh = () => onSettled('old-token');
          },
        }) as unknown as Promise<string>
    );
    const nextFile = fileUrl.replace('photo.jpg', 'next.jpg');
    function CommittingImage({ src }: { src: string }) {
      useLayoutEffect(() => {
        if (src === nextFile) settleRefresh();
      }, [src]);
      return <PrivateFileImage src={src} alt="Private photo" onError={onError} />;
    }
    const token = { userId: 'owner', value: 'old-token', issuedAt: 0, refreshOnError };
    const view = render(
      <PrivateFileTokenContext.Provider value={token}>
        <CommittingImage src={fileUrl} />
      </PrivateFileTokenContext.Provider>
    );
    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));

    view.rerender(
      <PrivateFileTokenContext.Provider value={token}>
        <CommittingImage src={nextFile} />
      </PrivateFileTokenContext.Provider>
    );
    await act(async () => {});
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps the image as currentTarget when a failed refresh reaches onError', async () => {
    const onError = vi.fn(event => event.currentTarget.getAttribute('alt'));
    mocks.getToken
      .mockResolvedValueOnce('revoked-token')
      .mockRejectedValueOnce(new Error('network unavailable'));
    render(
      <PrivateFileTokenProvider>
        <PrivateFileImage src={fileUrl} alt="Private photo" onError={onError} />
      </PrivateFileTokenProvider>
    );
    await act(async () => {});

    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));
    await act(async () => {});
    expect(onError).toHaveReturnedWith('Private photo');
  });

  it('does not report a settled recovery after the image unmounts', async () => {
    let rejectRefresh: (error: Error) => void = () => {};
    const onError = vi.fn();
    mocks.getToken.mockResolvedValueOnce('revoked-token').mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRefresh = reject;
        })
    );
    const view = render(
      <PrivateFileTokenProvider>
        <PrivateFileImage src={fileUrl} alt="Private photo" onError={onError} />
      </PrivateFileTokenProvider>
    );
    await act(async () => {});
    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));
    view.unmount();

    await act(async () => rejectRefresh(new Error('network unavailable')));
    expect(onError).not.toHaveBeenCalled();
  });

  it('recovers a long-mounted image after a second token rotation', async () => {
    mocks.getToken
      .mockResolvedValueOnce('first-revoked-token')
      .mockResolvedValueOnce('first-replacement-token')
      .mockResolvedValueOnce('second-replacement-token');
    renderImage();
    await act(async () => {});

    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));
    await act(async () => {});
    expect(screen.getByRole('img', { name: 'Private photo' })).toHaveAttribute(
      'src',
      `${fileUrl}&token=first-replacement-token`
    );
    fireEvent.load(screen.getByRole('img', { name: 'Private photo' }));

    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));
    await act(async () => {});
    expect(mocks.getToken).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('img', { name: 'Private photo' })).toHaveAttribute(
      'src',
      `${fileUrl}&token=second-replacement-token`
    );
  });

  it('queues recovery when a scheduled token refresh is already in flight', async () => {
    let resolvePending: (value: string) => void = () => {};
    mocks.getToken
      .mockResolvedValueOnce('revoked-token')
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolvePending = resolve;
          })
      )
      .mockResolvedValueOnce('valid-token');
    renderImage();
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(mocks.getToken).toHaveBeenCalledTimes(2);

    fireEvent.error(screen.getByRole('img', { name: 'Private photo' }));
    await act(async () => resolvePending('revoked-token'));

    expect(mocks.getToken).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('img', { name: 'Private photo' })).toHaveAttribute(
      'src',
      `${fileUrl}&token=valid-token`
    );
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

  it('makes no file request while signed out and removes a loaded image on logout', async () => {
    mocks.userId = '';
    mocks.record = null;
    mocks.getToken.mockResolvedValue('owner-token');
    const view = renderImage();

    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Private photo' })).not.toHaveAttribute('src');

    mocks.userId = 'owner';
    mocks.record = { id: 'owner' };
    view.rerender(
      <PrivateFileTokenProvider>
        <PrivateFileImage src={fileUrl} alt="Private photo" />
      </PrivateFileTokenProvider>
    );
    await act(async () => {});
    fireEvent.load(screen.getByRole('img', { name: 'Private photo' }));
    expect(screen.getByRole('img', { name: 'Private photo' })).toHaveAttribute('src');

    mocks.userId = '';
    mocks.record = null;
    view.rerender(
      <PrivateFileTokenProvider>
        <PrivateFileImage src={fileUrl} alt="Private photo" />
      </PrivateFileTokenProvider>
    );
    expect(screen.getByRole('img', { name: 'Private photo' })).not.toHaveAttribute('src');
    expect(mocks.getToken).toHaveBeenCalledTimes(1);
  });
});
