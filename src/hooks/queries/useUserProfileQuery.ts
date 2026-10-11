import { useQuery } from '@tanstack/react-query';
import { UserDTO } from '@/services/types';
import { UsersService } from '@/services/pocketbase/users.service';
import { resolveFileUrl } from '@/lib/pocketbase';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import { queryKeys } from './queryKeys';

/**
 * Fetches user profile data via UsersService
 */
const fetchUserProfile = async (userId: string): Promise<UserDTO> => {
  return await UsersService.getProfile(userId);
};

/**
 * React Query hook for fetching user profile data
 * Enhanced with better caching and error handling
 */
export const useUserProfileQuery = (userId: string | undefined) => {
  return useQuery({
    queryKey: userId ? queryKeys.user.profile(userId) : ['user', 'profile', 'disabled'],
    queryFn: () => fetchUserProfile(userId as string),
    enabled: !!userId,
    ...queryFreshness('frequent'),
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  });
};

/**
 * Helper hook that provides a simplified read-only profile interface
 * powered by React Query for better performance and caching
 */
export const useProfileData = (userId: string | undefined) => {
  const { data: profileData, isLoading, error, refetch } = useUserProfileQuery(userId);

  const profile = profileData
    ? {
        id: profileData.id,
        email: profileData.email,
        username: profileData.username,
        name: profileData.username || profileData.email || '',
        avatarUrl: profileData.avatar
          ? resolveFileUrl('users', profileData.id, profileData.avatar)
          : null,
        avatar: profileData.avatar,
      }
    : null;

  return {
    profile,
    isLoading,
    error,
    refetch,
  };
};
