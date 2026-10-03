import { notify } from '@/lib/notifications';
import { useState, useEffect } from 'react';
import { useSearchParams, Navigate, useLocation } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GlassPanel } from '@/components/ui/glass-panel';
import { resolveFileUrl } from '@/lib/pocketbase';
import { useUserProfileQuery } from '@/hooks/queries/useUserProfileQuery';
import { useAuth } from '@/hooks/useAuth';
import { useAvatar } from '@/hooks/useAvatar';
import ProfileHeader from '@/components/profile/ProfileHeader';
import AccountSettings from '@/components/profile/AccountSettings';
import { DataImportExportSections } from '@/features/import-export/components/DataImportExportSections';
import PayPalSupportSection from '@/components/profile/PayPalSupportSection';
import { ThemePreferences } from '@/components/profile/ThemePreferences';
import { TimezonePreferences } from '@/components/profile/TimezonePreferences';
import { VerticalToggles } from '@/components/profile/VerticalToggles';
import { ProfileHelpAndAppSettings } from '@/components/profile/ProfileHelpAndAppSettings';
import { SettingsSection } from '@/components/profile/SettingsSection';

import type { AvatarConfig } from '@/types/avatar';
import { logger } from '@/utils/logger';
import { useUpdateTimezoneMutation } from '@/hooks/mutations/useUpdateTimezoneMutation';
import { useUpdateThemePreferenceMutation } from '@/hooks/mutations/useUpdateThemePreferenceMutation';
import { useAppReady } from '@/hooks/useAppReady';
import type { AppTheme } from '@/lib/theme';

const Profile = () => {
  // URL query parameter handling for tabs.
  //
  // Tab slugs:
  //  - 'preferences' is the default and renders with no `?tab` param.
  //    Theme, timezone, and hobby trackers.
  //  - 'account' is identity + auth: avatar, username, email, password,
  //    danger zone.
  //  - 'data' is import/export.
  //  - 'support' bundles feedback, install, donate, and other meta.
  //  - older bookmarks at `?tab=profile` are forwarded to 'account' so
  //    saved links land near the personal info they expect.
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab =
    rawTab === 'profile'
      ? 'account'
      : rawTab === 'account' || rawTab === 'data' || rawTab === 'support'
        ? rawTab
        : 'preferences';

  // Authentication handling
  const { user, isLoading: authLoading } = useAuth();

  // Dismiss splash on mount; auth/profile still use in-app loading UI.
  useAppReady();

  // Profile data with React Query
  const {
    data: profileData,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = useUserProfileQuery(user?.id);

  // Local form state derived from profile data
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Derive local state from profile query data
  useEffect(() => {
    if (profileData) {
      setName(profileData.username || profileData.email || '');
      setEmail(profileData.email || '');
      setAvatarUrl(
        profileData.avatar ? resolveFileUrl('users', profileData.id, profileData.avatar) : null
      );
    }
  }, [profileData]);

  const isBetaTester = profileData?.betaTester ?? false;

  const updateTimezoneMutation = useUpdateTimezoneMutation();
  const updateThemePreferenceMutation = useUpdateThemePreferenceMutation();

  // Helper function to update timezone preference
  const handleTimezoneUpdate = async (timezone: string) => {
    if (!user?.id) return;
    try {
      await updateTimezoneMutation.mutateAsync({
        userId: user.id,
        timezone: timezone,
      });
    } catch (error) {
      logger.error('Error updating timezone:', error);
      notify({
        kind: 'error',
        title: 'Timezone update failed',
        description: 'Failed to update timezone preference',
      });
      throw error; // Re-throw to let the component handle it
    }
  };

  const handleThemeUpdate = async (themePreference: AppTheme) => {
    if (!user?.id) return;
    await updateThemePreferenceMutation.mutateAsync({
      userId: user.id,
      themePreference,
    });
  };

  // Avatar management
  const { revertToInitials } = useAvatar();

  // Handle avatar updates with React Query cache invalidation
  const handleAvatarUpdate = async (config: AvatarConfig) => {
    try {
      if (config.type === 'upload' && config.uploadUrl) {
        // The avatar is already uploaded by AvatarManager
        // Refetch profile to get the updated avatar URL from the server
        await refetchProfile();

        notify({
          kind: 'success',
          title: 'Avatar updated',
          description: 'Your avatar has been updated successfully!',
        });
      } else if (config.type === 'initials') {
        // Use the useAvatar hook for initials handling
        await revertToInitials();

        notify({
          kind: 'success',
          title: 'Avatar reverted',
          description: 'Avatar reverted to initials successfully!',
        });
      }
    } catch (error) {
      logger.error('Error updating avatar:', error);
      notify({
        kind: 'error',
        title: 'Avatar update failed',
        description: 'Failed to update avatar. Please try again.',
      });
    }
  };

  // Show loading state while authentication or profile is being loaded
  if (authLoading || profileLoading) {
    return (
      <MainLayout>
        <div className="container mx-auto max-w-5xl px-4 py-8">
          <div
            className="flex min-h-[400px] items-center justify-center"
            role="status"
            aria-live="polite"
          >
            <div className="text-center">
              <div
                className="border-primary mx-auto mb-4 size-8 animate-spin rounded-full border-b-2"
                aria-hidden="true"
              />
              <p className="text-muted-foreground">Loading profile…</p>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Unauthenticated visitors redirect to login after auth settles.
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <MainLayout>
      <div className="container mx-auto max-w-5xl p-4 md:py-8">
        <div className="space-y-6">
          <ProfileHeader />

          <Tabs
            value={activeTab}
            onValueChange={value => {
              setSearchParams(prev => {
                const newParams = new URLSearchParams(prev);
                if (value === 'preferences') {
                  newParams.delete('tab'); // Clean URL for default tab
                } else {
                  newParams.set('tab', value);
                }
                return newParams;
              });
            }}
            className="w-full"
          >
            <div className="border-border/50 bg-background sticky top-16 z-10 -mx-4 border-b px-4 pt-2 pb-4 md:top-0 md:mx-0 md:px-0">
              <div className="overflow-x-auto">
                <TabsList className="flex w-max min-w-full">
                  <TabsTrigger
                    value="account"
                    className="shrink-0 px-3 text-xs whitespace-nowrap sm:flex-1 sm:px-4 sm:text-sm pointer-coarse:min-h-11"
                  >
                    Account
                  </TabsTrigger>
                  <TabsTrigger
                    value="preferences"
                    className="shrink-0 px-3 text-xs whitespace-nowrap sm:flex-1 sm:px-4 sm:text-sm pointer-coarse:min-h-11"
                  >
                    Preferences
                  </TabsTrigger>
                  <TabsTrigger
                    value="data"
                    className="shrink-0 px-3 text-xs whitespace-nowrap sm:flex-1 sm:px-4 sm:text-sm pointer-coarse:min-h-11"
                  >
                    Data
                  </TabsTrigger>
                  <TabsTrigger
                    value="support"
                    className="shrink-0 px-3 text-xs whitespace-nowrap sm:flex-1 sm:px-4 sm:text-sm pointer-coarse:min-h-11"
                  >
                    Support
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <div className="mt-6">
              <TabsContent value="account" className="space-y-6">
                <AccountSettings
                  loading={profileLoading}
                  email={email}
                  name={name}
                  setName={setName}
                  userId={user?.id}
                  avatarUrl={avatarUrl}
                  isBetaTester={isBetaTester}
                  isVerified={profileData?.verified}
                  createdAt={profileData?.createdAt}
                  onAvatarUpdate={handleAvatarUpdate}
                />
              </TabsContent>

              <TabsContent value="preferences">
                <GlassPanel className="divide-border/60 divide-y">
                  <SettingsSection
                    title="Appearance"
                    description="Theme and time zone for your account, applied across devices."
                  >
                    <div className="space-y-6">
                      <ThemePreferences
                        currentThemePreference={profileData?.themePreference}
                        onThemeUpdate={handleThemeUpdate}
                      />
                      <TimezonePreferences onTimezoneUpdate={handleTimezoneUpdate} />
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    title="Trackers"
                    description="Pick which hobbies show up in your navigation and library. Turning one off hides it; nothing is deleted."
                  >
                    <VerticalToggles />
                  </SettingsSection>
                </GlassPanel>
              </TabsContent>

              <TabsContent value="data" className="space-y-6">
                <DataImportExportSections disabled={profileLoading} />
              </TabsContent>

              <TabsContent value="support" className="space-y-6">
                <ProfileHelpAndAppSettings currentPage="Profile" />

                <PayPalSupportSection />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
};

export default Profile;
