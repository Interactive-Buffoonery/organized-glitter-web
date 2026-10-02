import { useRef, useCallback, useEffect } from 'react';

export function useBlobCleanup() {
  const trackedUrls = useRef(new Set<string>());

  const createBlobUrl = useCallback((source: Blob | File): string => {
    const url = URL.createObjectURL(source);
    trackedUrls.current.add(url);
    return url;
  }, []);

  const revokeBlobUrl = useCallback((url: string) => {
    if (url && url.startsWith('blob:') && trackedUrls.current.has(url)) {
      URL.revokeObjectURL(url);
      trackedUrls.current.delete(url);
    }
  }, []);

  const revokeAll = useCallback(() => {
    trackedUrls.current.forEach(url => {
      URL.revokeObjectURL(url);
    });
    trackedUrls.current.clear();
  }, []);

  useEffect(() => {
    const urls = trackedUrls.current;
    return () => {
      urls.forEach(url => {
        URL.revokeObjectURL(url);
      });
      urls.clear();
    };
  }, []);

  return { createBlobUrl, revokeBlobUrl, revokeAll };
}
