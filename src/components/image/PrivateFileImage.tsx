import { useContext, useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { usePrivateFileUrl } from '@/hooks/usePrivateFileUrl';
import { PrivateFilesService } from '@/services/pocketbase/privateFiles.service';
import { PrivateFileTokenContext } from '@/contexts/privateFileTokenState';

/** Keeps PocketBase file URLs current without refetching their parent records. */
export function PrivateFileImage({
  src,
  alt,
  fallbackSrc,
  onLoad,
  onError,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt'> & { alt: string; fallbackSrc?: string }) {
  const resolvedSrc = usePrivateFileUrl(src);
  const token = useContext(PrivateFileTokenContext);
  const userId = PrivateFilesService.getCurrentUserId();
  const recovery = useRef({ fileUrl: src, userId, attempts: 0, pending: false, recoveringSrc: '' });
  const [loaded, setLoaded] = useState<{
    fileUrl: string;
    userId: string | undefined;
    resolvedSrc: string;
  } | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // A loaded image can retain its URL when the token rotates. New or still
  // loading images use the newest token, and account/file changes reset it.
  const candidateSrc =
    loaded && loaded.fileUrl === src && loaded.userId === userId ? loaded.resolvedSrc : resolvedSrc;
  const isShowingFallback = Boolean(fallbackSrc && candidateSrc && failedSrc === candidateSrc);
  const displaySrc = isShowingFallback ? fallbackSrc : candidateSrc;

  useLayoutEffect(() => {
    recovery.current = { fileUrl: src, userId, attempts: 0, pending: false, recoveringSrc: '' };
    return () => {
      recovery.current = { fileUrl: src, userId, attempts: 0, pending: false, recoveringSrc: '' };
    };
  }, [src, userId]);

  return (
    <img
      {...props}
      src={displaySrc || undefined}
      alt={alt}
      onLoad={event => {
        if (!isShowingFallback && candidateSrc && src) {
          setLoaded({ fileUrl: src, userId, resolvedSrc: candidateSrc });
          setFailedSrc(null);
          recovery.current = {
            fileUrl: src,
            userId,
            attempts: 0,
            pending: false,
            recoveringSrc: '',
          };
        }
        onLoad?.(event);
      }}
      onError={event => {
        if (event.currentTarget.getAttribute('src') !== displaySrc) return;
        if (isShowingFallback) return;
        const currentRecovery = recovery.current;
        if (currentRecovery.pending) {
          if (candidateSrc === currentRecovery.recoveringSrc) return;
          currentRecovery.pending = false;
        }
        setLoaded(null);

        if (candidateSrc && token?.refreshOnError && currentRecovery.attempts === 0) {
          let failedToken: string | null;
          try {
            failedToken = new URL(candidateSrc, window.location.href).searchParams.get('token');
          } catch {
            failedToken = null;
          }
          if (
            failedToken &&
            failedToken !== token.value &&
            token.userId === userId &&
            resolvedSrc !== candidateSrc
          ) {
            currentRecovery.attempts = 1;
            return;
          }
          if (failedToken === token.value && token.userId === userId) {
            currentRecovery.attempts = 1;
            currentRecovery.pending = true;
            currentRecovery.recoveringSrc = candidateSrc;
            const deferredEvent = { ...event, currentTarget: event.currentTarget };
            void token.refreshOnError(failedToken).then(replacement => {
              if (recovery.current !== currentRecovery || !currentRecovery.pending) return;
              currentRecovery.pending = false;
              if (replacement && replacement !== failedToken) return;
              setFailedSrc(candidateSrc);
              onError?.(deferredEvent);
            });
            return;
          }
        }
        setFailedSrc(candidateSrc || null);
        onError?.(event);
      }}
    />
  );
}
