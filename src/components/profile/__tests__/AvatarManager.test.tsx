import { act } from '@testing-library/react';
import { Suspense, startTransition, useState } from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import imageCompression from 'browser-image-compression';
import { AvatarManager } from '../AvatarManager';
import type { AvatarManagerProps } from '@/types/avatar';
import { PrivateFileTokenContext } from '@/contexts/privateFileTokenState';

const { revokeAllMock, croppedFile } = vi.hoisted(() => ({
  revokeAllMock: vi.fn(),
  croppedFile: new File(['cropped'], 'cropped-photo.jpg', { type: 'image/jpeg' }),
}));

vi.mock('@/hooks/useBlobCleanup', () => ({
  useBlobCleanup: () => ({
    createBlobUrl: vi.fn(() => 'blob:avatar-preview'),
    revokeBlobUrl: vi.fn(),
    revokeAll: revokeAllMock,
  }),
}));
vi.mock('@/lib/notifications', () => ({ notify: vi.fn() }));
vi.mock('@/services/auth', () => ({ getCurrentUserId: () => 'user-1' }));
vi.mock('@/services/pocketbase/users.service', () => ({ UsersService: { uploadAvatar: vi.fn() } }));
vi.mock('@/lib/pocketbase', () => ({
  resolveFileUrl: vi.fn(),
  pb: { baseUrl: 'https://pb.example', authStore: { record: { id: 'user-1' } } },
}));
vi.mock('browser-image-compression', () => ({ default: vi.fn() }));
vi.mock('../ImageCropModal', () => ({
  default: ({ onCropComplete }: { onCropComplete: (file: File) => void }) => (
    <button type="button" onClick={() => onCropComplete(croppedFile)}>
      Finish crop
    </button>
  ),
}));

const baseProps: AvatarManagerProps = {
  currentAvatar: 'https://example.test/avatar.png',
  currentConfig: { type: 'upload', uploadUrl: 'https://example.test/avatar.png' },
  onAvatarUpdate: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
  isOpen: false,
};

describe('AvatarManager', () => {
  beforeEach(() => {
    revokeAllMock.mockClear();
  });

  it('resets preview state on open and close transitions', () => {
    const { rerender } = render(<AvatarManager {...baseProps} />);
    expect(screen.queryByAltText('Avatar preview')).not.toBeInTheDocument();

    rerender(<AvatarManager {...baseProps} isOpen />);
    expect(screen.getByAltText('Avatar preview')).toHaveAttribute(
      'src',
      'https://example.test/avatar.png'
    );

    rerender(<AvatarManager {...baseProps} isOpen={false} />);
    expect(revokeAllMock).toHaveBeenCalled();

    rerender(
      <AvatarManager
        {...baseProps}
        isOpen
        currentAvatar={undefined}
        currentConfig={{ type: 'initials' }}
      />
    );
    expect(screen.queryByAltText('Avatar preview')).not.toBeInTheDocument();
    expect(screen.getByText('Upload an image to preview')).toBeInTheDocument();
  });

  it('updates the preview when the current avatar changes while open', () => {
    const { rerender } = render(<AvatarManager {...baseProps} isOpen />);
    expect(screen.getByAltText('Avatar preview')).toHaveAttribute(
      'src',
      'https://example.test/avatar.png'
    );

    rerender(
      <AvatarManager
        {...baseProps}
        isOpen
        currentAvatar="https://example.test/new-avatar.png"
        currentConfig={{ type: 'upload', uploadUrl: 'https://example.test/new-avatar.png' }}
      />
    );

    expect(screen.getByAltText('Avatar preview')).toHaveAttribute(
      'src',
      'https://example.test/new-avatar.png'
    );
  });

  it('preserves an upload draft across saved avatar refreshes until reopening', async () => {
    const source = new File(['source'], 'photo.jpg', { type: 'image/jpeg' });
    vi.mocked(imageCompression).mockReset().mockResolvedValue(source);
    const { rerender } = render(<AvatarManager {...baseProps} isOpen />);
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [source] },
    });
    await screen.findByText('Finish crop');

    const refreshedProps = {
      ...baseProps,
      currentAvatar: undefined,
      currentConfig: { type: 'initials' as const },
    };
    rerender(<AvatarManager {...refreshedProps} isOpen />);
    expect(screen.getByText('Finish crop')).toBeInTheDocument();
    expect(screen.getByAltText('Avatar preview')).toHaveAttribute('src', 'blob:avatar-preview');

    fireEvent.click(screen.getByText('Finish crop'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Avatar' })).toBeEnabled());
    const latestProps = {
      ...baseProps,
      currentAvatar: 'https://example.test/latest.png',
      currentConfig: { type: 'upload' as const, uploadUrl: 'https://example.test/latest.png' },
    };
    rerender(<AvatarManager {...latestProps} isOpen />);
    expect(screen.getByRole('button', { name: 'Save Avatar' })).toBeEnabled();
    expect(screen.getByAltText('Avatar preview')).toHaveAttribute('src', 'blob:avatar-preview');

    rerender(<AvatarManager {...latestProps} isOpen={false} />);
    rerender(<AvatarManager {...latestProps} isOpen />);
    expect(screen.getByAltText('Avatar preview')).toHaveAttribute(
      'src',
      'https://example.test/latest.png'
    );
    expect(screen.getByRole('button', { name: 'Save Avatar' })).toBeDisabled();
  });

  it('shows the saved avatar with a file token in the management dialog', () => {
    render(
      <PrivateFileTokenContext.Provider
        value={{ userId: 'user-1', value: 'private-token', issuedAt: Date.now() }}
      >
        <AvatarManager
          {...baseProps}
          isOpen
          currentAvatar="https://pb.example/api/files/users/user-1/avatar.jpg"
        />
      </PrivateFileTokenContext.Provider>
    );

    expect(screen.getByAltText('Avatar preview')).toHaveAttribute(
      'src',
      'https://pb.example/api/files/users/user-1/avatar.jpg?token=private-token'
    );
  });

  it('keeps the preview stable when only the upload URL config changes', () => {
    const { rerender } = render(<AvatarManager {...baseProps} isOpen />);
    expect(screen.getByAltText('Avatar preview')).toHaveAttribute(
      'src',
      'https://example.test/avatar.png'
    );

    rerender(
      <AvatarManager
        {...baseProps}
        isOpen
        currentConfig={{ type: 'upload', uploadUrl: 'https://example.test/stale-config.png' }}
      />
    );

    expect(screen.getByAltText('Avatar preview')).toHaveAttribute(
      'src',
      'https://example.test/avatar.png'
    );
  });

  it('resets the preview when the config changes away from upload while open', () => {
    const { rerender } = render(<AvatarManager {...baseProps} isOpen />);
    expect(screen.getByAltText('Avatar preview')).toHaveAttribute(
      'src',
      'https://example.test/avatar.png'
    );

    rerender(
      <AvatarManager
        {...baseProps}
        isOpen
        currentAvatar={undefined}
        currentConfig={{ type: 'initials' }}
      />
    );

    expect(screen.queryByAltText('Avatar preview')).not.toBeInTheDocument();
    expect(screen.getByText('Upload an image to preview')).toBeInTheDocument();
  });

  it('cleans up tracked blob URLs when the user closes the dialog', () => {
    const onClose = vi.fn();
    render(<AvatarManager {...baseProps} isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(revokeAllMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('compresses the cropped File after the initial upload pass', async () => {
    const sourceFile = new File(['source'], 'photo.png', { type: 'image/png' });
    const firstPassFile = new File(['first'], 'photo.png', { type: 'image/png' });
    const finalPassFile = new File(['final'], 'cropped-photo.jpg', { type: 'image/jpeg' });
    const compressionMock = vi.mocked(imageCompression);
    compressionMock.mockReset();
    compressionMock.mockResolvedValueOnce(firstPassFile).mockResolvedValueOnce(finalPassFile);

    render(<AvatarManager {...baseProps} isOpen />);
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [sourceFile] } });

    await screen.findByText('Finish crop');
    fireEvent.click(screen.getByText('Finish crop'));

    await waitFor(() => expect(compressionMock).toHaveBeenCalledTimes(2));
    expect(compressionMock.mock.calls[0][0]).toBe(sourceFile);
    expect(compressionMock.mock.calls[1]).toEqual([
      croppedFile,
      {
        maxSizeMB: 1,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        initialQuality: 0.7,
      },
    ]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Avatar' })).toBeEnabled());
  });

  it('preserves a processed upload after abandoning a suspended avatar reset', async () => {
    const pending = new Promise<void>(() => {});
    const source = new File(['source'], 'photo.jpg', { type: 'image/jpeg' });
    vi.mocked(imageCompression).mockReset().mockResolvedValue(source);
    let update!: (value: { avatar: string; suspended: boolean }) => void;
    let attempted = false;
    const Suspend = ({ active }: { active: boolean }) => {
      if (active) {
        attempted = true;
        throw pending;
      }
      return null;
    };
    const Harness = () => {
      const [state, setState] = useState({ avatar: baseProps.currentAvatar!, suspended: false });
      update = setState;
      return (
        <>
          <AvatarManager {...baseProps} isOpen currentAvatar={state.avatar} />
          <Suspend active={state.suspended} />
        </>
      );
    };
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>
    );
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [source] },
    });
    fireEvent.click(await screen.findByText('Finish crop'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Avatar' })).toBeEnabled());
    await act(async () => {
      startTransition(() => update({ avatar: 'https://example.test/new.png', suspended: true }));
    });
    expect(attempted).toBe(true);
    act(() => update({ avatar: baseProps.currentAvatar!, suspended: false }));
    expect(screen.getByRole('button', { name: 'Save Avatar' })).toBeEnabled();
    expect(screen.getByAltText('Avatar preview')).toHaveAttribute('src', 'blob:avatar-preview');
  });
});
