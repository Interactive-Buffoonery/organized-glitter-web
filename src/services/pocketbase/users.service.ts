/**
 * Users service: profile queries and mutations for user records
 * @author @serabi
 */

import PocketBase, { BaseAuthStore, type RecordModel } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { Collections, UsersResponse } from '@/types/pocketbase.types';
import { UserDTO } from '@/services/types';
import { ErrorHandler } from './base/ErrorHandler';
import { isAuthenticated, getCurrentUserId } from '@/services/auth';
import { createLogger } from '@/utils/logger';
import { FilterBuilder } from '@/services/pocketbase/base/filterBuilder';
import { resolveThemePreference } from '@/lib/theme';
import type { AppTheme } from '@/lib/theme';

const logger = createLogger('UsersService');

function requireCurrentUserId(): string {
  if (!isAuthenticated()) {
    throw ErrorHandler.createError('auth', 'User not authenticated', false);
  }
  const userId = getCurrentUserId();
  if (!userId) {
    throw ErrorHandler.createError('auth', 'User not authenticated', false);
  }
  return userId;
}

function verifyOwnership(targetUserId: string): void {
  const currentUserId = requireCurrentUserId();
  if (targetUserId !== currentUserId) {
    throw ErrorHandler.createError(
      'permission',
      "You don't have permission to modify this account",
      false
    );
  }
}

/** Transform PocketBase record to domain DTO */
function toUserDTO(record: UsersResponse): UserDTO {
  // PB schema marks avatar/timezone/beta_tester/verified/emailVisibility as
  // optional; Required<> on the response type hides this. Default here so the
  // UserDTO contract (always-present scalars) holds at runtime.
  return {
    id: record.id,
    email: record.email,
    username: record.username,
    avatar: record.avatar ?? '',
    timezone: record.timezone ?? '',
    themePreference: resolveThemePreference(record.theme_preference),
    betaTester: record.beta_tester ?? false,
    verified: record.verified ?? false,
    emailVisibility: record.emailVisibility ?? false,
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

export class UsersService {
  static async refreshDetachedSession(token: string, record: RecordModel) {
    const client = new PocketBase(pb.baseURL, new BaseAuthStore());
    client.authStore.save(token, record);
    return client.collection(Collections.Users).authRefresh();
  }

  /** Get a user profile by ID */
  static async getProfile(userId: string): Promise<UserDTO> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection(Collections.Users).getOne(userId);
      return toUserDTO(record);
    }, 'Users.getProfile');
  }

  /** Update user fields (timezone, beta_tester, username, etc.). Verifies ownership. */
  static async update(
    userId: string,
    data: Partial<{
      username: string;
      timezone: string;
      theme_preference: AppTheme;
      beta_tester: boolean;
    }>
  ): Promise<UserDTO> {
    verifyOwnership(userId);
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection(Collections.Users).update(userId, data);
      return toUserDTO(record);
    }, 'Users.update');
  }

  /** Mark the coloring walkthrough as seen. Verifies ownership. */
  static async markColoringWalkthroughSeen(userId: string): Promise<void> {
    verifyOwnership(userId);
    return ErrorHandler.handleAsync(async () => {
      await pb.collection(Collections.Users).update(userId, {
        coloring_walkthrough_seen: true,
      });

      try {
        await pb.collection(Collections.Users).authRefresh();
      } catch (error) {
        logger.warn('authRefresh after marking walkthrough seen failed', error);
      }
    }, 'Users.markColoringWalkthroughSeen');
  }

  /** Upload a new avatar (returns updated user record). Verifies ownership. */
  static async uploadAvatar(userId: string, avatarFile: File): Promise<UserDTO> {
    verifyOwnership(userId);
    return ErrorHandler.handleAsync(async () => {
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      const record = await pb.collection(Collections.Users).update(userId, formData);
      return toUserDTO(record);
    }, 'Users.uploadAvatar');
  }

  /** Remove avatar (returns updated user record). Verifies ownership. */
  static async removeAvatar(userId: string): Promise<UserDTO> {
    verifyOwnership(userId);
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection(Collections.Users).update(userId, { avatar: null });
      return toUserDTO(record);
    }, 'Users.removeAvatar');
  }

  /** Check if a username is available (excludes the given user ID) */
  static async isUsernameAvailable(username: string, excludeUserId: string): Promise<boolean> {
    return ErrorHandler.handleAsync(async () => {
      const fb = new FilterBuilder();
      fb.equals('username', username);
      fb.notEquals('id', excludeUserId);
      const result = await pb.collection(Collections.Users).getList(1, 1, {
        filter: fb.build(),
      });
      return result.items.length === 0;
    }, 'Users.isUsernameAvailable');
  }
}
