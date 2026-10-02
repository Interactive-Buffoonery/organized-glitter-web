/**
 * Dashboard settings service: navigation context + vertical-toggle persistence
 * @author @serabi
 */

import { pb } from '@/lib/pocketbase';
import { UserDashboardSettingsResponse } from '@/types/pocketbase.types';
import { ErrorHandler } from './base/ErrorHandler';
import { createLogger } from '@/utils/logger';
import {
  DEFAULT_RANDOMIZER_NEXT_UP,
  type RandomizerMode,
  type RandomizerNextUpPreferences,
  type RandomizerNextUpTarget,
  type RandomizerTargetType,
} from '@/types/randomizer';

const logger = createLogger('DashboardSettingsService');

export type VerticalToggles = {
  diamond_painting: boolean;
  coloring_books: boolean;
};

export const DEFAULT_VERTICAL_TOGGLES: VerticalToggles = {
  diamond_painting: true,
  coloring_books: false,
};

type SettingsRowWithVerticals = UserDashboardSettingsResponse & {
  vertical_enabled?: VerticalToggles | null;
};

type SettingsRowWithRandomizerNextUp = UserDashboardSettingsResponse & {
  randomizer_next_up?: unknown | null;
};

const RANDOMIZER_MODES: RandomizerMode[] = ['diamond', 'coloring-book', 'coloring-page'];
const RANDOMIZER_TARGET_TYPES: RandomizerTargetType[] = [
  'diamond_project',
  'coloring_book',
  'coloring_page',
];

function normalizeVerticalToggles(value: unknown): VerticalToggles {
  if (value && typeof value === 'object') {
    const v = value as Partial<VerticalToggles>;
    const normalized = {
      diamond_painting: v.diamond_painting === true,
      coloring_books: v.coloring_books === true,
    };
    return normalized.diamond_painting || normalized.coloring_books
      ? normalized
      : { ...DEFAULT_VERTICAL_TOGGLES };
  }
  return { ...DEFAULT_VERTICAL_TOGGLES };
}

function createDefaultRandomizerNextUp(): RandomizerNextUpPreferences {
  return {
    version: DEFAULT_RANDOMIZER_NEXT_UP.version,
    targets: {},
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNextUpTarget(
  mode: RandomizerMode,
  value: unknown
): RandomizerNextUpTarget | null {
  if (!isPlainRecord(value)) return null;

  const { id, targetType, title, subtitle, href, savedAt } = value;
  if (
    typeof id !== 'string' ||
    typeof targetType !== 'string' ||
    typeof title !== 'string' ||
    typeof subtitle !== 'string' ||
    typeof href !== 'string' ||
    typeof savedAt !== 'string'
  ) {
    return null;
  }

  if (!RANDOMIZER_TARGET_TYPES.includes(targetType as RandomizerTargetType)) {
    return null;
  }

  return {
    id,
    mode,
    targetType: targetType as RandomizerTargetType,
    title,
    subtitle,
    href,
    savedAt,
  };
}

export function normalizeRandomizerNextUp(value: unknown): RandomizerNextUpPreferences {
  if (!isPlainRecord(value) || value.version !== 1) {
    return createDefaultRandomizerNextUp();
  }

  const rawTargets = value.targets;
  if (!isPlainRecord(rawTargets)) {
    return createDefaultRandomizerNextUp();
  }

  const targets: RandomizerNextUpPreferences['targets'] = {};

  RANDOMIZER_MODES.forEach(mode => {
    const target = normalizeNextUpTarget(mode, rawTargets[mode]);
    if (target) {
      targets[mode] = target;
    }
  });

  return {
    version: 1,
    targets,
  };
}

function assertAtLeastOneVerticalEnabled(verticals: VerticalToggles) {
  if (!verticals.diamond_painting && !verticals.coloring_books) {
    throw new Error('At least one tracker must be enabled.');
  }
}

async function createSettingsRowOrRecover(
  userId: string,
  data: Record<string, unknown>,
  operation: string
): Promise<string> {
  try {
    const created = await pb.collection('user_dashboard_settings').create({
      user: userId,
      ...data,
    });
    return (created as { id: string }).id;
  } catch (createError) {
    // A unique user index makes concurrent first-time settings writes race at
    // create. Re-read after any failed or ambiguous create response: if the
    // row now exists, apply this field-specific patch so neither write is lost.
    let existing: UserDashboardSettingsResponse;
    try {
      existing = await pb
        .collection('user_dashboard_settings')
        .getFirstListItem(pb.filter('user = {:userId}', { userId }));
    } catch {
      throw createError;
    }

    await pb.collection('user_dashboard_settings').update(existing.id, data);
    logger.warn('Recovered a concurrent dashboard settings create', { operation });
    return existing.id;
  }
}

export class DashboardSettingsService {
  /**
   * Load the persisted navigation context for a user. Returns `null` when no
   * record exists yet (first dashboard visit) or when the field is empty.
   * Generic over the consumer's narrow shape so the service stays decoupled
   * from `DashboardFilterContext`.
   */
  static async loadNavigationContext<T = unknown>(userId: string): Promise<T | null> {
    return ErrorHandler.handleAsync(async () => {
      try {
        const record = await pb
          .collection('user_dashboard_settings')
          .getFirstListItem<
            UserDashboardSettingsResponse<unknown, T>
          >(pb.filter('user = {:userId}', { userId }));
        return (record.navigation_context ?? null) as T | null;
      } catch (error) {
        const handled = ErrorHandler.handleError(error, 'DashboardSettings.loadNavigationContext');
        if (handled.type === 'not_found') return null;
        throw handled;
      }
    }, 'DashboardSettings.loadNavigationContext');
  }

  /**
   * Save navigation context (upsert: finds existing record or creates new).
   * Returns the record ID for caching.
   */
  static async saveNavigationContext(
    userId: string,
    navigationContext: unknown,
    cachedRecordId?: string
  ): Promise<string> {
    return ErrorHandler.handleAsync(async () => {
      // Fast path: update using cached record ID
      if (cachedRecordId) {
        try {
          await pb.collection('user_dashboard_settings').update(cachedRecordId, {
            navigation_context: navigationContext,
          });
          return cachedRecordId;
        } catch (err) {
          const handled = ErrorHandler.handleError(err, 'DashboardSettings.updateCached');
          if (handled.type === 'not_found') {
            logger.warn('Cached settings id invalidated; falling back to lookup');
          } else {
            throw handled;
          }
        }
      }

      // Lookup existing record or create a new one
      let record: UserDashboardSettingsResponse | undefined;
      try {
        record = await pb
          .collection('user_dashboard_settings')
          .getFirstListItem(pb.filter('user = {:userId}', { userId }));
      } catch (error) {
        const handled = ErrorHandler.handleError(error, 'DashboardSettings.lookup');
        if (handled.type !== 'not_found') {
          throw handled;
        }
      }

      if (record) {
        await pb.collection('user_dashboard_settings').update(record.id, {
          navigation_context: navigationContext,
        });
        logger.info(`Updated existing navigation context for user ${userId}`);
        return record.id;
      } else {
        const recordId = await createSettingsRowOrRecover(
          userId,
          { navigation_context: navigationContext },
          'navigation_context'
        );
        logger.info(`Created new navigation context for user ${userId}`);
        return recordId;
      }
    }, 'DashboardSettings.saveNavigationContext');
  }

  /**
   * Read the user's vertical-toggle preferences. Returns defaults
   * (`{ diamond_painting: true, coloring_books: false }`) when no settings row
   * exists yet; never throws on `not_found`. The server-side hook
   * (`pb_hooks/dashboard_settings.pb.js`) enforces the at-least-one-enabled
   * invariant, so callers can trust the returned shape.
   */
  static async getVerticalToggles(userId: string): Promise<VerticalToggles> {
    return ErrorHandler.handleAsync(async () => {
      try {
        const record = (await pb
          .collection('user_dashboard_settings')
          .getFirstListItem(pb.filter('user = {:userId}', { userId }))) as SettingsRowWithVerticals;
        return normalizeVerticalToggles(record.vertical_enabled);
      } catch (error) {
        const handled = ErrorHandler.handleError(error, 'DashboardSettings.getVerticalToggles');
        if (handled.type === 'not_found') {
          return { ...DEFAULT_VERTICAL_TOGGLES };
        }
        throw handled;
      }
    }, 'DashboardSettings.getVerticalToggles');
  }

  /**
   * Save coloring navigation context (upsert: finds existing record or creates new).
   * Writes only the `coloring_navigation_context` column so diamond's
   * `navigation_context` is never touched by coloring writes.
   */
  static async saveColoringNavigationContext(
    userId: string,
    coloringNavigationContext: unknown,
    cachedRecordId?: string
  ): Promise<string> {
    return ErrorHandler.handleAsync(async () => {
      if (cachedRecordId) {
        try {
          await pb.collection('user_dashboard_settings').update(cachedRecordId, {
            coloring_navigation_context: coloringNavigationContext,
          });
          return cachedRecordId;
        } catch (err) {
          const handled = ErrorHandler.handleError(err, 'DashboardSettings.updateCachedColoring');
          if (handled.type === 'not_found') {
            logger.warn('Cached settings id invalidated; falling back to lookup');
          } else {
            throw handled;
          }
        }
      }

      let record: UserDashboardSettingsResponse | undefined;
      try {
        record = await pb
          .collection('user_dashboard_settings')
          .getFirstListItem(pb.filter('user = {:userId}', { userId }));
      } catch (error) {
        const handled = ErrorHandler.handleError(error, 'DashboardSettings.lookupColoring');
        if (handled.type !== 'not_found') {
          throw handled;
        }
      }

      if (record) {
        await pb.collection('user_dashboard_settings').update(record.id, {
          coloring_navigation_context: coloringNavigationContext,
        });
        logger.info(`Updated coloring navigation context for user ${userId}`);
        return record.id;
      } else {
        const recordId = await createSettingsRowOrRecover(
          userId,
          { coloring_navigation_context: coloringNavigationContext },
          'coloring_navigation_context'
        );
        logger.info(`Created coloring navigation context for user ${userId}`);
        return recordId;
      }
    }, 'DashboardSettings.saveColoringNavigationContext');
  }

  /**
   * Read the user's saved coloring filter state. Returns null when no record
   * exists or the column has never been written (caller decides defaults).
   */
  static async getColoringNavigationContext(userId: string): Promise<unknown | null> {
    return ErrorHandler.handleAsync(async () => {
      try {
        const record = await pb
          .collection('user_dashboard_settings')
          .getFirstListItem(pb.filter('user = {:userId}', { userId }));
        return (record as UserDashboardSettingsResponse).coloring_navigation_context ?? null;
      } catch (error) {
        const handled = ErrorHandler.handleError(
          error,
          'DashboardSettings.getColoringNavigationContext'
        );
        if (handled.type === 'not_found') {
          return null;
        }
        throw handled;
      }
    }, 'DashboardSettings.getColoringNavigationContext');
  }

  /**
   * Read durable per-mode randomizer pins. Malformed JSON falls back to an
   * empty preference set so the randomizer can keep loading safely.
   */
  static async getRandomizerNextUp(userId: string): Promise<RandomizerNextUpPreferences> {
    return ErrorHandler.handleAsync(async () => {
      try {
        const record = (await pb
          .collection('user_dashboard_settings')
          .getFirstListItem(
            pb.filter('user = {:userId}', { userId })
          )) as SettingsRowWithRandomizerNextUp;
        return normalizeRandomizerNextUp(record.randomizer_next_up);
      } catch (error) {
        const handled = ErrorHandler.handleError(error, 'DashboardSettings.getRandomizerNextUp');
        if (handled.type === 'not_found') {
          return createDefaultRandomizerNextUp();
        }
        throw handled;
      }
    }, 'DashboardSettings.getRandomizerNextUp');
  }

  /**
   * Save durable per-mode randomizer pins. Writes only the
   * `randomizer_next_up` column so spin history and dashboard context stay
   * isolated from this preference.
   */
  static async saveRandomizerNextUp(
    userId: string,
    randomizerNextUp: RandomizerNextUpPreferences,
    cachedRecordId?: string
  ): Promise<string> {
    return ErrorHandler.handleAsync(async () => {
      const normalized = normalizeRandomizerNextUp(randomizerNextUp);

      if (cachedRecordId) {
        try {
          await pb.collection('user_dashboard_settings').update(cachedRecordId, {
            randomizer_next_up: normalized,
          });
          return cachedRecordId;
        } catch (err) {
          const handled = ErrorHandler.handleError(
            err,
            'DashboardSettings.updateCachedRandomizerNextUp'
          );
          if (handled.type === 'not_found') {
            logger.warn('Cached settings id invalidated; falling back to lookup');
          } else {
            throw handled;
          }
        }
      }

      let record: UserDashboardSettingsResponse | undefined;
      try {
        record = await pb
          .collection('user_dashboard_settings')
          .getFirstListItem(pb.filter('user = {:userId}', { userId }));
      } catch (error) {
        const handled = ErrorHandler.handleError(error, 'DashboardSettings.lookupRandomizerNextUp');
        if (handled.type !== 'not_found') {
          throw handled;
        }
      }

      if (record) {
        await pb.collection('user_dashboard_settings').update(record.id, {
          randomizer_next_up: normalized,
        });
        logger.info('Updated randomizer next-up preferences');
        return record.id;
      }

      const recordId = await createSettingsRowOrRecover(
        userId,
        { randomizer_next_up: normalized },
        'randomizer_next_up'
      );
      logger.info('Created randomizer next-up preferences');
      return recordId;
    }, 'DashboardSettings.saveRandomizerNextUp');
  }

  /**
   * Save vertical-toggle preferences (upsert). Returns the record ID for caching.
   * Mirrors the cache-aware upsert in `saveNavigationContext`.
   */
  static async saveVerticalToggles(
    userId: string,
    verticals: VerticalToggles,
    cachedRecordId?: string
  ): Promise<string> {
    assertAtLeastOneVerticalEnabled(verticals);

    return ErrorHandler.handleAsync(async () => {
      // Fast path: update using cached record ID
      if (cachedRecordId) {
        try {
          await pb.collection('user_dashboard_settings').update(cachedRecordId, {
            vertical_enabled: verticals,
          });
          return cachedRecordId;
        } catch (err) {
          const handled = ErrorHandler.handleError(err, 'DashboardSettings.updateCachedVerticals');
          if (handled.type === 'not_found') {
            logger.warn('Cached settings id invalidated; falling back to lookup');
          } else {
            throw handled;
          }
        }
      }

      // Lookup existing record or create a new one
      let record: UserDashboardSettingsResponse | undefined;
      try {
        record = await pb
          .collection('user_dashboard_settings')
          .getFirstListItem(pb.filter('user = {:userId}', { userId }));
      } catch (error) {
        const handled = ErrorHandler.handleError(error, 'DashboardSettings.lookupVerticals');
        if (handled.type !== 'not_found') {
          throw handled;
        }
      }

      if (record) {
        await pb.collection('user_dashboard_settings').update(record.id, {
          vertical_enabled: verticals,
        });
        logger.info(`Updated vertical toggles for user ${userId}`);
        return record.id;
      } else {
        const recordId = await createSettingsRowOrRecover(
          userId,
          { vertical_enabled: verticals },
          'vertical_enabled'
        );
        logger.info(`Created vertical toggles for user ${userId}`);
        return recordId;
      }
    }, 'DashboardSettings.saveVerticalToggles');
  }
}
