import { notify } from '@/lib/notifications';
import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatLocalDate, parseTimestamp } from '@/utils/date/timezoneUtils';
import { ArrowRight, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AnalyticsPreference } from '@/components/profile/AnalyticsPreference';
import { SettingsSection } from '@/components/profile/SettingsSection';
import { SignInMethods } from '@/components/profile/SignInMethods';
import AvatarDisplay from '@/components/profile/AvatarDisplay';
import { AvatarManager } from '@/components/profile/AvatarManager';
import { BetaTesterIcon } from '@/components/auth/icons';
import { UsersService } from '@/services/pocketbase/users.service';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/utils/logger';
import { cn } from '@/lib/utils';
import { createAvatarConfig, getUserInitials } from '@/utils/image/avatarUtils';
import type { AvatarConfig } from '@/types/avatar';

interface AccountSettingsProps {
  loading: boolean;
  email?: string;
  name: string;
  setName: React.Dispatch<React.SetStateAction<string>>;
  userId?: string;
  avatarUrl: string | null;
  isBetaTester?: boolean;
  isVerified?: boolean;
  createdAt?: string;
  onAvatarUpdate?: (config: AvatarConfig) => Promise<void>;
}

/**
 * Field row used inside the Identity / Security sections.
 *
 * Layout: caps label on top, plain-text value below, optional inline badge
 * to the right of the label, and a text-style "Change →" affordance pinned
 * to the right on `sm`+ (stacks below the value on phones).
 *
 * The right-hand action is intentionally a quiet text link rather than a
 * button; the only saturated control on this card lives in the Danger
 * Zone, so destructive actions don't visually compete with mundane ones.
 */
function FieldRow({
  label,
  value,
  badge,
  to,
  onClick,
  changeLabel = 'Change',
  emphasis = false,
}: {
  label: string;
  value?: React.ReactNode;
  badge?: React.ReactNode;
  to?: string;
  onClick?: () => void;
  changeLabel?: string;
  emphasis?: boolean;
}) {
  const sharedLinkClasses = cn(
    'group/link inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap',
    'text-primary hover:underline underline-offset-4',
    'focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none'
  );

  const action = to ? (
    <Link to={to} className={sharedLinkClasses}>
      {changeLabel}
      <ArrowRight
        className="size-3.5 transition-transform group-hover/link:translate-x-0.5"
        aria-hidden
      />
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={sharedLinkClasses}>
      {changeLabel}
      <ArrowRight
        className="size-3.5 transition-transform group-hover/link:translate-x-0.5"
        aria-hidden
      />
    </button>
  );

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
            {label}
          </p>
          {badge}
        </div>
        <p
          className={cn(
            'truncate text-base',
            emphasis ? 'text-muted-foreground italic' : 'text-foreground'
          )}
        >
          {value}
        </p>
      </div>
      <div className="shrink-0 sm:pb-0.5">{action}</div>
    </div>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
      <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
      Verified
    </span>
  );
}

const AccountSettings = ({
  loading: profileLoading,
  email,
  name,
  setName,
  userId,
  avatarUrl,
  isBetaTester = false,
  isVerified = false,
  createdAt,
  onAvatarUpdate,
}: AccountSettingsProps) => {
  const { user } = useAuth();

  const [isUsernameDialogOpen, setIsUsernameDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameUpdateLoading, setUsernameUpdateLoading] = useState(false);
  const [isAvatarManagerOpen, setIsAvatarManagerOpen] = useState(false);

  const currentAvatarConfig = useMemo(
    () => createAvatarConfig({ avatar_url: avatarUrl, email: email ?? '', username: name }),
    [avatarUrl, email, name]
  );

  const handleAvatarUpdate = useCallback(
    async (config: AvatarConfig) => {
      if (onAvatarUpdate) {
        await onAvatarUpdate(config);
      }
    },
    [onAvatarUpdate]
  );

  const handleUsernameDialogOpenChange = (open: boolean) => {
    if (open) {
      setNewUsername(name);
    }
    setIsUsernameDialogOpen(open);
  };

  if (profileLoading) {
    return (
      <GlassPanel className="p-6 text-center">
        <p className="text-muted-foreground text-sm">Loading account details…</p>
      </GlassPanel>
    );
  }

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userId || !newUsername.trim()) {
      notify({
        kind: 'error',
        title: 'Username required',
        description: 'Username cannot be empty',
      });
      return;
    }

    setUsernameUpdateLoading(true);

    try {
      const available = await UsersService.isUsernameAvailable(newUsername, userId);

      if (!available) {
        notify({
          kind: 'error',
          title: 'Username already taken',
          description: 'Please choose a different username',
        });
        return;
      }

      await UsersService.update(userId, { username: newUsername });

      setName(newUsername);
      setIsUsernameDialogOpen(false);

      notify({
        kind: 'success',
        title: 'Username updated',
        description: 'Your username has been updated',
      });
    } catch (error) {
      logger.error('Error updating username:', error);
      notify({
        kind: 'error',
        title: 'Profile update failed',
        description: 'Something went wrong while updating your profile',
      });
    } finally {
      setUsernameUpdateLoading(false);
    }
  };

  const trimmedName = name?.trim() ?? '';
  const hasUsername = trimmedName.length > 0;
  const usernameDisplay = hasUsername ? trimmedName : 'Set a username';
  const usernameChangeLabel = hasUsername ? 'Change' : 'Set username';

  const displayedEmail = email || user?.email || 'Not available';

  // "member since Jan 2025", guarded against bad ISO from cache misses.
  let memberSince: string | null = null;
  if (createdAt) {
    try {
      memberSince = `member since ${formatLocalDate(parseTimestamp(createdAt), 'MMM yyyy')}`;
    } catch {
      memberSince = null;
    }
  }

  return (
    <GlassPanel className="divide-border/60 divide-y overflow-hidden">
      {/* Identity header: portrait + name + email + member-since + manage-avatar action. */}
      <header className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:items-center sm:gap-6 sm:p-8 sm:text-left">
        <div className="border-background ring-border/60 relative size-20 shrink-0 overflow-hidden rounded-full border-4 ring-1 sm:size-24">
          <AvatarDisplay
            config={currentAvatarConfig}
            size={96}
            fallbackInitials={getUserInitials(name, email ?? '')}
            className="size-full rounded-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-start">
            <h2 className="text-foreground truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {hasUsername ? trimmedName : 'Diamond Art Enthusiast'}
            </h2>
            {isBetaTester && (
              <span className="text-primary inline-flex items-center gap-1.5 text-xs font-semibold">
                <BetaTesterIcon className="size-3.5" />
                Beta tester
              </span>
            )}
          </div>
          {email && <p className="text-muted-foreground truncate text-sm">{email}</p>}
          {memberSince && <p className="text-muted-foreground/80 text-xs">{memberSince}</p>}
          {onAvatarUpdate && (
            <div className="pt-3">
              <Button
                onClick={() => setIsAvatarManagerOpen(true)}
                variant="glass"
                size="sm"
                type="button"
              >
                <Settings className="size-4" />
                Manage avatar
              </Button>
            </div>
          )}
        </div>
      </header>

      <SettingsSection title="Identity">
        <div className="space-y-5">
          <FieldRow
            label="Username"
            value={usernameDisplay}
            emphasis={!hasUsername}
            changeLabel={usernameChangeLabel}
            onClick={() => {
              setNewUsername(hasUsername ? trimmedName : '');
              handleUsernameDialogOpenChange(true);
            }}
          />

          <FieldRow
            label="Email address"
            value={displayedEmail}
            badge={isVerified ? <VerifiedBadge /> : undefined}
            to="/change-email"
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Security">
        <div className="space-y-6">
          <FieldRow label="Password" value="••••••••••••" to="/change-password" />
          {userId && (
            <div className="border-border/60 border-t pt-6">
              <h3 className="text-foreground mb-1 text-sm font-semibold">Sign-in methods</h3>
              <p className="text-muted-foreground mb-4 text-sm">
                Connect another provider so you have more than one way to access your account.
              </p>
              <SignInMethods userId={userId} />
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Privacy">
        <AnalyticsPreference />
      </SettingsSection>

      <SettingsSection title="Danger zone" description="Account deletion" tone="danger" collapsible>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="space-y-1">
            <p className="text-foreground text-sm font-semibold">Delete account</p>
            <p className="text-muted-foreground text-sm">
              Once you delete your account, there is no going back. This permanently removes your
              projects, stash, and history.
            </p>
          </div>
          <div className="shrink-0">
            <Button variant="glass-destructive" size="sm" asChild>
              <Link to="/delete-account">Delete my account</Link>
            </Button>
          </div>
        </div>
      </SettingsSection>

      {/* Username dialog, opened from the Identity section. */}
      <Dialog open={isUsernameDialogOpen} onOpenChange={handleUsernameDialogOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{hasUsername ? 'Update username' : 'Set username'}</DialogTitle>
            <DialogDescription>
              Enter your new username. This will be visible to other users.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateUsername} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-username">New username</Label>
              <Input
                id="new-username"
                type="text"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="Enter your new username"
                required
              />
            </div>

            <DialogFooter>
              <Button type="submit" variant="glass" disabled={usernameUpdateLoading}>
                {usernameUpdateLoading ? 'Updating…' : 'Save username'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {onAvatarUpdate && (
        <AvatarManager
          isOpen={isAvatarManagerOpen}
          onClose={() => setIsAvatarManagerOpen(false)}
          currentAvatar={avatarUrl || undefined}
          currentConfig={currentAvatarConfig}
          onAvatarUpdate={async config => {
            await handleAvatarUpdate(config);
            setIsAvatarManagerOpen(false);
          }}
          userEmail={email ?? ''}
        />
      )}
    </GlassPanel>
  );
};

export default AccountSettings;
