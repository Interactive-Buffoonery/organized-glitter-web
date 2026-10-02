import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn(), {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));

import { notify, notifyError, notifyInfo, notifySuccess, notifyWarning } from '../notify';

describe('notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes success notifications to toast.success', () => {
    notify({
      kind: 'success',
      title: 'Project saved',
      description: 'Everything synced correctly.',
      durationMs: 3210,
    });

    expect(toastMock.success).toHaveBeenCalledWith('Project saved', {
      description: 'Everything synced correctly.',
      duration: 3210,
    });
  });

  it('routes warning notifications to toast.warning', () => {
    notify({
      kind: 'warning',
      title: 'Metadata incomplete',
      description: 'Some linked records could not be created.',
    });

    expect(toastMock.warning).toHaveBeenCalledWith('Metadata incomplete', {
      description: 'Some linked records could not be created.',
      duration: 5000,
    });
  });

  it('routes error notifications to toast.error', () => {
    notify({
      kind: 'error',
      title: 'Delete failed',
      description: 'Try again in a moment.',
    });

    expect(toastMock.error).toHaveBeenCalledWith('Delete failed', {
      description: 'Try again in a moment.',
      duration: 6000,
    });
  });

  it('routes info notifications to the neutral toast function', () => {
    notify({
      kind: 'info',
      title: 'Position restored',
      description: 'Returned to your previous location.',
    });

    expect(toastMock).toHaveBeenCalledWith('Position restored', {
      description: 'Returned to your previous location.',
      duration: 4000,
    });
  });

  it('exposes convenience helpers for each notification kind', () => {
    notifySuccess('Saved', 'Success path');
    notifyWarning('Careful', 'Warning path');
    notifyError('Failed', 'Error path');
    notifyInfo('Heads up', 'Info path');

    expect(toastMock.success).toHaveBeenCalledWith('Saved', {
      description: 'Success path',
      duration: 4000,
    });
    expect(toastMock.warning).toHaveBeenCalledWith('Careful', {
      description: 'Warning path',
      duration: 5000,
    });
    expect(toastMock.error).toHaveBeenCalledWith('Failed', {
      description: 'Error path',
      duration: 6000,
    });
    expect(toastMock).toHaveBeenCalledWith('Heads up', {
      description: 'Info path',
      duration: 4000,
    });
  });
});
