import { useContext, useEffect, useState } from 'react';
import { PrivateFileTokenContext } from '@/contexts/privateFileTokenState';
import { PrivateFilesService } from '@/services/pocketbase/privateFiles.service';

/** Resolves a stable PocketBase file URL using the current account's short-lived token. */
export function usePrivateFileUrl(fileUrl: string | null | undefined): string {
  const token = useContext(PrivateFileTokenContext);
  const [previous, setPrevious] = useState<{
    fileUrl: string;
    userId: string;
    resolvedUrl: string;
  } | null>(null);

  useEffect(() => {
    if (!fileUrl || !token || !isPocketBaseFileUrl(fileUrl)) return;
    const resolvedUrl = resolvePrivateFileUrl(fileUrl, token.value);
    setPrevious({ fileUrl, userId: token.userId, resolvedUrl });
  }, [fileUrl, token]);

  if (!fileUrl) return '';
  if (!isPocketBaseFileUrl(fileUrl)) return fileUrl;

  if (!token) {
    return previous?.fileUrl === fileUrl &&
      previous.userId === PrivateFilesService.getCurrentUserId()
      ? previous.resolvedUrl
      : '';
  }

  return resolvePrivateFileUrl(fileUrl, token.value);
}

function resolvePrivateFileUrl(fileUrl: string, token: string): string {
  const url = new URL(fileUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

function isPocketBaseFileUrl(fileUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    return false;
  }

  const baseUrl = PrivateFilesService.getBaseUrl();
  if (!baseUrl) return false;
  const base = new URL(baseUrl);
  return (
    url.origin === base.origin &&
    url.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/api/files/`)
  );
}
