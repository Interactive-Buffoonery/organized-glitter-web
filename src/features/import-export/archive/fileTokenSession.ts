import { ArchiveFilesService } from '@/services/pocketbase/archiveFiles.service';

// PocketBase file tokens last about two minutes. Refresh before that so long
// archive exports do not keep using an expired token.
export const FILE_TOKEN_REFRESH_AFTER_MS = 90_000;

export type FileTokenSession = {
  current(): Promise<string>;
  refresh(): Promise<string>;
};

export function createFileTokenSession(
  initialToken: string,
  options: {
    now?: () => number;
    requestToken?: () => Promise<string>;
  } = {}
): FileTokenSession {
  const now = options.now ?? Date.now;
  const requestToken = options.requestToken ?? (() => ArchiveFilesService.getPrivateFileToken());
  let token = initialToken;
  let issuedAt = now();
  let refreshPromise: Promise<string> | null = null;

  const refresh = (): Promise<string> => {
    if (!refreshPromise) {
      refreshPromise = requestToken()
        .then(nextToken => {
          token = nextToken;
          issuedAt = now();
          return nextToken;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  };

  return {
    async current() {
      if (now() - issuedAt >= FILE_TOKEN_REFRESH_AFTER_MS) {
        return refresh();
      }
      return token;
    },
    refresh,
  };
}
