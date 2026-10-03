import { notify } from '@/lib/notifications';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

import { useAuth } from '@/hooks/useAuth';
import { AccountDeletionService } from '@/services/pocketbase/accountDeletion.service';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import MainLayout from '@/components/layout/MainLayout';
import { AlertTriangle } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import { useAppReady } from '@/hooks/useAppReady';
import { useNoIndexPage } from '@/hooks/usePageMetadata';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { clearAccountDrafts } from '@/hooks/drafts/formDraftStorage';

const deleteAccountLogger = createLogger('DeleteAccount');

function getDeleteFailureMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as {
      message?: string;
      status?: number;
      type?: string;
      details?: { auditCaptured?: boolean };
    };

    if (candidate.details?.auditCaptured && candidate.message) {
      return candidate.message;
    }

    if (candidate.type === 'permission' || candidate.status === 403) {
      return 'You do not have permission to perform this action. Please contact support.';
    }

    if (candidate.type === 'validation' || candidate.status === 400) {
      return 'Invalid request. Please try again or contact support.';
    }

    if (candidate.type === 'network') {
      return 'Network connection failed. Please check your connection and try again.';
    }
  }

  return 'Failed to delete your account. Please try again or contact support.';
}

const DeleteAccount = () => {
  useAppReady();

  // Prevent search engines from indexing auth pages
  useNoIndexPage('Delete Account');

  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [notes, setNotes] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleCancel = () => {
    navigate('/profile');
  };

  const handleConfirmationChange = (checked: boolean) => {
    setIsConfirmed(checked);
  };

  const handleFeedbackChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(e.target.value);
  };

  const handleDeleteAccount = async () => {
    if (!isConfirmed) {
      notify({
        kind: 'error',
        title: 'Confirmation required',
        description: 'Please confirm that you want to delete your account',
      });
      return;
    }

    if (!user) {
      notify({
        kind: 'error',
        title: 'Authentication required',
        description: 'You must be logged in to delete your account',
      });
      return;
    }

    setIsLoading(true);
    deleteAccountLogger.debug(
      '[SECURE DELETION] Starting account deletion process for user:',
      user.id
    );

    try {
      const outcome = await AccountDeletionService.deleteAccount({ user, notes });

      deleteAccountLogger.debug('[SECURE DELETION] Account deletion service completed', {
        userId: user.id,
        outcome,
      });
      if (!clearAccountDrafts({ backendUrl: POCKETBASE_URL, accountId: user.id })) {
        notify({
          kind: 'warning',
          title: 'Local drafts could not be cleared',
          description:
            'Clear this site’s browser data to remove unfinished drafts from this device.',
        });
      }

      deleteAccountLogger.debug('[SECURE DELETION] Signing out user session');
      try {
        const signOutResult = await signOut();

        if (!signOutResult.success) {
          throw signOutResult.error ?? new Error('Session cleanup failed');
        }
      } catch (signOutError) {
        deleteAccountLogger.error(
          '[SECURE DELETION] Account deleted but session cleanup failed:',
          signOutError
        );

        notify({
          kind: 'error',
          title: 'Account deleted',
          description:
            'Your account was deleted, but this device session could not be cleared. Please refresh or sign in again.',
        });
        return;
      }

      notify({
        kind: 'info',
        title:
          outcome.status === 'already_deleted'
            ? 'Account already deleted'
            : 'Account deleted successfully',
        description:
          outcome.status === 'already_deleted'
            ? 'Your account was already deleted. Your local session has been cleared.'
            : 'Your account and all related data have been permanently removed.',
      });

      deleteAccountLogger.debug('[SECURE DELETION] Process completed successfully');

      navigate('/');
    } catch (error) {
      deleteAccountLogger.error('[SECURE DELETION] Error in deletion process:', error);

      notify({
        kind: 'error',
        title: 'Error',
        description: getDeleteFailureMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="dark:glass-card border-destructive/30 bg-card text-card-foreground mx-auto max-w-2xl rounded-lg border shadow">
          <div className="border-border border-b p-6">
            <div className="flex items-center gap-x-2">
              <AlertTriangle className="text-destructive-text size-6" />
              <h1 className="text-destructive-text text-2xl font-semibold">Delete Your Account</h1>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <div className="border-destructive/20 bg-destructive/10 rounded-md border p-4">
              <p className="font-medium">Warning: This action cannot be undone</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Deleting your account will permanently remove all your data, including:
              </p>
              <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1 text-sm">
                <li>All your coloring books, coloring pages, and diamond art projects</li>
                <li>Progress images</li>
                <li>Personal profile information</li>
                <li>Account settings and preferences</li>
              </ul>
              <p className="text-muted-foreground mt-2 text-sm">
                If you used Apple sign-in, an encrypted token is kept only until Apple confirms
                revocation. It cannot restore your account.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="feedback" className="text-base font-medium">
                  We'd appreciate your feedback (optional)
                </Label>
                <p className="text-muted-foreground mb-2 text-sm">
                  Please let us know why you're leaving so we can improve our service
                </p>
                <Textarea
                  id="feedback"
                  placeholder="Share your thoughts with us..."
                  value={notes}
                  onChange={handleFeedbackChange}
                  className="h-32"
                />
              </div>

              <div className="flex items-start gap-x-2 pt-2">
                <Checkbox
                  id="confirm"
                  checked={isConfirmed}
                  onCheckedChange={handleConfirmationChange}
                />

                <Label
                  htmlFor="confirm"
                  className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  I understand that this action is permanent and cannot be undone
                </Label>
              </div>
            </div>
          </div>

          <div className="border-border bg-muted/50 flex justify-end gap-x-4 border-t p-6">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="glass-destructive"
              onClick={handleDeleteAccount}
              disabled={!isConfirmed || isLoading}
            >
              {isLoading ? 'Deleting...' : 'Delete My Account'}
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default DeleteAccount;
