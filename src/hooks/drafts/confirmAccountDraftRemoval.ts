import { checkpointAccountDrafts, hasAccountDrafts } from './formDraftStorage';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';

export function confirmAccountDraftRemoval(
  accountId: string | undefined,
  message: string
): boolean {
  if (!accountId) return true;

  const identity = { backendUrl: POCKETBASE_URL, accountId };
  const hasActiveDraft = checkpointAccountDrafts(identity);
  return !hasActiveDraft && !hasAccountDrafts(identity) ? true : window.confirm(message);
}
