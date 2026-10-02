import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';

type GrowthFunnelState = {
  captured?: Partial<Record<string, true>>;
  activation?: {
    itemCount?: number;
    progressNoteAdded?: boolean;
    photoAdded?: boolean;
    randomizerUsed?: boolean;
  };
};

type ActivationSignal = 'item_created' | 'progress_note_added' | 'photo_added' | 'randomizer_used';

type FunnelEvent =
  | typeof AnalyticsEvent.FIRST_PROJECT_CREATED
  | typeof AnalyticsEvent.FIRST_COLORING_BOOK_CREATED
  | typeof AnalyticsEvent.FIRST_PROGRESS_NOTE_ADDED
  | typeof AnalyticsEvent.FIRST_PHOTO_ADDED
  | typeof AnalyticsEvent.RANDOMIZER_FIRST_SPIN;

const STORAGE_PREFIX = 'og:growth-funnel:v1';
const ACTIVATION_ITEM_THRESHOLD = 3;

const getStorageKey = (userId: string) => `${STORAGE_PREFIX}:${encodeURIComponent(userId)}`;

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
};

const readState = (userId: string): GrowthFunnelState => {
  const storage = getStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(getStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as GrowthFunnelState;
  } catch {
    return {};
  }
};

const writeState = (userId: string, state: GrowthFunnelState): void => {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(getStorageKey(userId), JSON.stringify(state));
  } catch {
    // Analytics persistence is best effort and should never affect product flows.
  }
};

const applyActivationSignal = (
  state: GrowthFunnelState,
  signal: ActivationSignal
): GrowthFunnelState => {
  const activation = { ...state.activation };

  if (signal === 'item_created') {
    activation.itemCount = (activation.itemCount ?? 0) + 1;
  }

  if (signal === 'progress_note_added') {
    activation.progressNoteAdded = true;
  }

  if (signal === 'photo_added') {
    activation.photoAdded = true;
  }

  if (signal === 'randomizer_used') {
    activation.randomizerUsed = true;
  }

  return { ...state, activation };
};

const shouldCaptureActivation = (state: GrowthFunnelState): boolean => {
  if (state.captured?.[AnalyticsEvent.ACTIVATION_COMPLETED]) return false;

  const activation = state.activation;
  if (!activation) return false;

  const hasEngagement =
    activation.progressNoteAdded === true ||
    activation.photoAdded === true ||
    activation.randomizerUsed === true;

  return (activation.itemCount ?? 0) >= ACTIVATION_ITEM_THRESHOLD && hasEngagement;
};

const captureActivationIfReady = (
  state: GrowthFunnelState,
  properties: Record<string, unknown>
): GrowthFunnelState => {
  if (!shouldCaptureActivation(state)) return state;

  const activation = state.activation ?? {};
  capture(AnalyticsEvent.ACTIVATION_COMPLETED, {
    item_count: activation.itemCount ?? 0,
    has_progress_note: activation.progressNoteAdded === true,
    has_photo: activation.photoAdded === true,
    has_randomizer_use: activation.randomizerUsed === true,
    ...properties,
  });

  return {
    ...state,
    captured: {
      ...state.captured,
      [AnalyticsEvent.ACTIVATION_COMPLETED]: true,
    },
  };
};

export function trackGrowthFunnelMilestone({
  userId,
  event,
  properties = {},
  activationSignal,
}: {
  userId?: string | null;
  event: FunnelEvent;
  properties?: Record<string, unknown>;
  activationSignal?: ActivationSignal;
}): void {
  if (!userId) return;

  const existingState = readState(userId);
  const stateWithSignal = activationSignal
    ? applyActivationSignal(existingState, activationSignal)
    : existingState;

  const captured = stateWithSignal.captured ?? {};
  let nextState = stateWithSignal;

  if (!captured[event]) {
    capture(event, properties);
    nextState = {
      ...nextState,
      captured: {
        ...captured,
        [event]: true,
      },
    };
  }

  nextState = captureActivationIfReady(nextState, {
    completion_source: event,
  });

  writeState(userId, nextState);
}
