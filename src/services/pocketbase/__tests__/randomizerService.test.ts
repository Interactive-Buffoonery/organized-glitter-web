import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateSpinMetadata } from '../randomizerService';
import type { RandomizerSpinMetadata } from '@/types/randomizer';

const { updateMock, collectionMock } = vi.hoisted(() => {
  const update = vi.fn();
  return {
    updateMock: update,
    collectionMock: vi.fn(() => ({
      update,
    })),
  };
});

vi.mock('@/lib/pocketbase', () => ({
  pb: {
    collection: collectionMock,
    filter: vi.fn(),
  },
}));

const metadata: RandomizerSpinMetadata = {
  version: 1,
  mode: 'diamond',
  target: {
    id: 'project12345678',
    targetType: 'diamond_project',
    title: 'Aurora Wolves',
    subtitle: 'Moonlight Co.',
    href: '/projects/project12345678',
  },
  eligibility: {
    diamondStatuses: ['progress'],
    bookStatuses: ['in_progress'],
    pageStatuses: ['palette_chosen', 'in_progress'],
    ownership: 'owned',
  },
  selectedTargetIds: ['project12345678', 'project23456789'],
  selectedTargets: [
    {
      id: 'project12345678',
      targetType: 'diamond_project',
      title: 'Aurora Wolves',
      subtitle: 'Moonlight Co.',
    },
  ],
};

describe('randomizerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue({ id: 'spin12345678901', metadata });
  });

  it('updates spin metadata for a valid spin ID', async () => {
    await updateSpinMetadata('spin12345678901', metadata);

    expect(collectionMock).toHaveBeenCalledWith('randomizer_spins');
    expect(updateMock).toHaveBeenCalledWith('spin12345678901', { metadata });
  });

  it('rejects invalid spin IDs before calling PocketBase', async () => {
    await expect(updateSpinMetadata('bad-id', metadata)).rejects.toMatchObject({
      message: 'Invalid spin ID - must be a 15-character PocketBase ID',
    });

    expect(collectionMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
