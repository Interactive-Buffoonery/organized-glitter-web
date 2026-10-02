import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captureMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
}));

vi.mock('@/services/analytics-escape-hatch', () => ({
  capture: captureMock,
}));

const { AnalyticsEvent } = await import('@/services/analytics-events');
const { trackGrowthFunnelMilestone } = await import('@/services/growth-funnel-analytics');

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    get length() {
      return store.size;
    },
  } satisfies Storage;

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
}

describe('growth funnel analytics', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

  beforeEach(() => {
    captureMock.mockClear();
    installLocalStorageMock();
  });

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(window, 'localStorage', originalLocalStorage);
    }
  });

  it('captures a first-action milestone once per user', () => {
    const payload = {
      craft: 'diamond',
      entity_type: 'project',
      source_surface: 'new_project',
    };

    trackGrowthFunnelMilestone({
      userId: 'user-1',
      event: AnalyticsEvent.FIRST_PROJECT_CREATED,
      properties: payload,
      activationSignal: 'item_created',
    });
    trackGrowthFunnelMilestone({
      userId: 'user-1',
      event: AnalyticsEvent.FIRST_PROJECT_CREATED,
      properties: payload,
      activationSignal: 'item_created',
    });

    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith('first_project_created', payload);
  });

  it('tracks first-action milestones independently per user', () => {
    trackGrowthFunnelMilestone({
      userId: 'user-1',
      event: AnalyticsEvent.RANDOMIZER_FIRST_SPIN,
      activationSignal: 'randomizer_used',
    });
    trackGrowthFunnelMilestone({
      userId: 'user-2',
      event: AnalyticsEvent.RANDOMIZER_FIRST_SPIN,
      activationSignal: 'randomizer_used',
    });

    expect(captureMock).toHaveBeenCalledTimes(2);
    expect(captureMock).toHaveBeenNthCalledWith(1, 'randomizer_first_spin', {});
    expect(captureMock).toHaveBeenNthCalledWith(2, 'randomizer_first_spin', {});
  });

  it('captures activation once after three items and one engagement signal', () => {
    trackGrowthFunnelMilestone({
      userId: 'user-1',
      event: AnalyticsEvent.FIRST_PROJECT_CREATED,
      activationSignal: 'item_created',
    });
    trackGrowthFunnelMilestone({
      userId: 'user-1',
      event: AnalyticsEvent.FIRST_COLORING_BOOK_CREATED,
      activationSignal: 'item_created',
    });
    trackGrowthFunnelMilestone({
      userId: 'user-1',
      event: AnalyticsEvent.FIRST_PROJECT_CREATED,
      activationSignal: 'item_created',
    });
    trackGrowthFunnelMilestone({
      userId: 'user-1',
      event: AnalyticsEvent.FIRST_PROGRESS_NOTE_ADDED,
      properties: { entity_type: 'project_progress_note' },
      activationSignal: 'progress_note_added',
    });
    trackGrowthFunnelMilestone({
      userId: 'user-1',
      event: AnalyticsEvent.RANDOMIZER_FIRST_SPIN,
      activationSignal: 'randomizer_used',
    });

    expect(captureMock).toHaveBeenCalledWith(
      'activation_completed',
      expect.objectContaining({
        item_count: 3,
        has_progress_note: true,
        has_photo: false,
        has_randomizer_use: false,
        completion_source: 'first_progress_note_added',
      })
    );
    expect(
      captureMock.mock.calls.filter(([event]) => event === 'activation_completed')
    ).toHaveLength(1);
  });

  it('does not throw when localStorage is unavailable', () => {
    const storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });

    expect(() =>
      trackGrowthFunnelMilestone({
        userId: 'user-1',
        event: AnalyticsEvent.FIRST_PHOTO_ADDED,
        activationSignal: 'photo_added',
      })
    ).not.toThrow();

    if (storageDescriptor) {
      Object.defineProperty(window, 'localStorage', storageDescriptor);
    }
  });
});
