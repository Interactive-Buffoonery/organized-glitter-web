import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Maximize, ExternalLink, Loader2, RefreshCw, Image as ImageIcon, X } from 'lucide-react';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/variants';
import { cn } from '@/lib/utils';
import { ImageErrorBoundary } from '@/components/error/ComponentErrorBoundaries';
import { logger } from '@/utils/logger';
import { isPlaceholderImage } from '@/utils/image/imageUtils';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import FallbackImage from './FallbackImage';
import { usePrivateFileUrl } from '@/hooks/usePrivateFileUrl';
import { PrivateFileImage } from '@/components/image/PrivateFileImage';

type PreviewFit = 'cover' | 'contain';
type ImageContentMode = 'preview' | 'modal';
type ImageLoadStatus = 'fallback' | 'error' | 'loading' | 'loaded';
type RenderedImageLoadStatus = Exclude<ImageLoadStatus, 'fallback'>;

interface ImageGalleryProps {
  imageUrl: string;
  alt: string;
  instagramStyle?: boolean;
  /**
   * Controls how the preview image sits inside the preview box. `instagramStyle`
   * chooses the box ratio, while `previewFit` chooses crop versus letterbox.
   */
  previewFit?: PreviewFit;
  size?: 'small' | 'medium' | 'large' | 'full';
}

const ImageGallery = ({
  imageUrl,
  alt,
  instagramStyle = false,
  previewFit = 'cover',
  size = 'medium',
}: ImageGalleryProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const privateImageUrl = usePrivateFileUrl(imageUrl);

  const retry = () => {
    setRetryNonce(n => n + 1);
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <ImageGalleryBody
        key={`${imageUrl}:${retryNonce}`}
        imageUrl={imageUrl}
        canOpenInNewTab={privateImageUrl === imageUrl}
        alt={alt}
        instagramStyle={instagramStyle}
        previewFit={previewFit}
        size={size}
        retryNonce={retryNonce}
        onRetry={retry}
        onClose={() => setIsDialogOpen(false)}
      />
    </Dialog>
  );
};

type ImageGalleryBodyProps = Required<
  Pick<ImageGalleryProps, 'instagramStyle' | 'previewFit' | 'size'>
> &
  Pick<ImageGalleryProps, 'imageUrl' | 'alt'> & {
    canOpenInNewTab: boolean;
    retryNonce: number;
    onRetry: () => void;
    onClose: () => void;
  };

const ImageGalleryBody = ({
  imageUrl,
  canOpenInNewTab,
  alt,
  instagramStyle,
  previewFit,
  size,
  retryNonce,
  onRetry,
  onClose,
}: ImageGalleryBodyProps) => {
  const [previewStatus, setPreviewStatus] = useState<RenderedImageLoadStatus>('loading');
  const [modalStatus, setModalStatus] = useState<RenderedImageLoadStatus>('loading');
  const previewRatio = instagramStyle ? 1 : 4 / 3;

  const shouldUseFallback =
    !imageUrl || imageUrl.includes('example.com') || isPlaceholderImage(imageUrl);
  const previewImageLoadStatus: ImageLoadStatus = shouldUseFallback ? 'fallback' : previewStatus;
  const modalImageLoadStatus: ImageLoadStatus = shouldUseFallback ? 'fallback' : modalStatus;

  const maxSize = {
    small: 'max-w-[200px]',
    medium: 'max-w-[400px]',
    large: 'max-w-[500px]',
    full: 'max-w-none',
  }[size];

  const handleImageError = (mode: ImageContentMode) => {
    logger.error('Image render error:', { imageUrl });
    if (mode === 'preview') {
      setPreviewStatus('error');
      return;
    }

    setModalStatus('error');
  };

  return (
    <>
      <div className={`relative ${maxSize} mx-auto`}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="group relative block w-full cursor-pointer border-0 bg-transparent p-0"
            aria-label={`View larger image: ${alt}`}
          >
            <div className="w-full overflow-hidden rounded-lg">
              <AspectRatio ratio={previewRatio} className="w-full">
                <ImageErrorBoundary alt={alt} originalUrl={imageUrl}>
                  <div className="relative size-full">
                    <ImageContent
                      imageUrl={imageUrl}
                      alt={alt}
                      previewFit={previewFit}
                      retryNonce={retryNonce}
                      mode="preview"
                      status={previewImageLoadStatus}
                      onRetry={onRetry}
                      onLoad={() => setPreviewStatus('loaded')}
                      onError={() => handleImageError('preview')}
                    />
                  </div>
                </ImageErrorBoundary>
              </AspectRatio>
            </div>
            {previewImageLoadStatus === 'loaded' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize className="size-6 text-white" />
              </div>
            )}
          </button>
        </DialogTrigger>
        {previewImageLoadStatus === 'error' && (
          <Button
            type="button"
            onClick={onRetry}
            variant="link"
            size="sm"
            className="absolute inset-x-0 bottom-4 z-10 mx-auto w-fit gap-1 text-xs [&_svg]:size-3"
          >
            <RefreshCw />
            Try again
          </Button>
        )}
      </div>

      <DialogContent
        showCloseButton={false}
        className="image-gallery-dialog max-w-4xl border-0 bg-transparent p-0 shadow-none"
      >
        <VisuallyHidden>
          <DialogHeader>
            <DialogTitle>Image Gallery</DialogTitle>
            <DialogDescription>
              View a larger version of the image. Use Close, press Escape, or click outside to
              dismiss.
            </DialogDescription>
          </DialogHeader>
        </VisuallyHidden>
        <div className="w-full rounded-lg bg-black/90 p-2">
          <ImageErrorBoundary alt={alt} originalUrl={imageUrl}>
            <div className="relative">
              {shouldUseFallback ? (
                <FallbackImage alt={alt} originalUrl={imageUrl} className="max-h-[80vh]" />
              ) : (
                <ImageContent
                  imageUrl={imageUrl}
                  alt={alt}
                  previewFit={previewFit}
                  retryNonce={retryNonce}
                  mode="modal"
                  status={modalImageLoadStatus}
                  onRetry={onRetry}
                  onLoad={() => setModalStatus('loaded')}
                  onError={() => handleImageError('modal')}
                />
              )}
              <div className="absolute top-2 right-2 z-10 flex gap-2">
                {!shouldUseFallback && modalImageLoadStatus === 'error' && (
                  <Button
                    type="button"
                    onClick={onRetry}
                    size="icon"
                    variant="secondary"
                    className="bg-background/80 hover:bg-background/90 size-9 rounded-full pointer-coarse:size-11 [&_svg]:size-5"
                    aria-label="Retry loading image"
                  >
                    <RefreshCw aria-hidden="true" />
                  </Button>
                )}
                {!shouldUseFallback && modalImageLoadStatus !== 'error' && canOpenInNewTab && (
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open image in new tab"
                    className={cn(
                      buttonVariants({ variant: 'secondary', size: 'icon' }),
                      'bg-background/80 hover:bg-background/90 size-9 rounded-full pointer-coarse:size-11 [&_svg]:size-5'
                    )}
                  >
                    <ExternalLink aria-hidden="true" />
                  </a>
                )}
                <Button
                  type="button"
                  variant="glass"
                  size="icon-sm"
                  className="pointer-coarse:size-11"
                  aria-label="Close"
                  onClick={onClose}
                >
                  <X aria-hidden="true" />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
            </div>
          </ImageErrorBoundary>
        </div>
      </DialogContent>
    </>
  );
};

interface ImageContentProps {
  imageUrl: string;
  alt: string;
  previewFit: PreviewFit;
  retryNonce: number;
  mode: ImageContentMode;
  status: ImageLoadStatus;
  onRetry: () => void;
  onLoad: () => void;
  onError: () => void;
}

const ImageContent = ({
  imageUrl,
  alt,
  previewFit,
  retryNonce,
  mode,
  status,
  onRetry,
  onLoad,
  onError,
}: ImageContentProps) => {
  const imageClasses =
    mode === 'modal'
      ? 'w-full h-auto max-h-[80vh] object-contain mx-auto'
      : previewFit === 'contain'
        ? 'size-full object-contain'
        : 'size-full object-cover transition-transform group-hover:scale-105 duration-300';

  if (status === 'fallback') {
    return (
      <div className="bg-muted text-muted-foreground flex size-full flex-col items-center justify-center p-4">
        <div className="text-muted-foreground mb-2">
          <ImageIcon className="mx-auto size-12" />
        </div>
        <p className="text-center text-sm">No image available</p>
        <p className="text-muted-foreground mt-1 text-center text-xs">
          URL: {imageUrl ? imageUrl.substring(0, 50) + '...' : 'None'}
        </p>
      </div>
    );
  }

  return (
    <>
      {status === 'loading' && (
        <div className="bg-secondary/50 absolute inset-0 flex items-center justify-center">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      )}
      <PrivateFileImage
        key={retryNonce}
        src={imageUrl}
        alt={alt}
        className={imageClasses}
        loading="lazy"
        decoding="async"
        onLoad={onLoad}
        onError={onError}
      />
      {status === 'error' && (
        <div className="bg-muted text-muted-foreground absolute inset-0 flex size-full flex-col items-center justify-center p-4">
          <div className="text-muted-foreground mb-2">
            <ImageIcon className="mx-auto size-12" />
          </div>
          <p role="status" className="text-center text-sm">
            Image failed to load
          </p>
          {mode === 'modal' && (
            <Button
              type="button"
              onClick={onRetry}
              variant="link"
              size="sm"
              className="mt-2 h-auto gap-1 p-0 text-xs [&_svg]:size-3"
            >
              <RefreshCw />
              Try again
            </Button>
          )}
        </div>
      )}
    </>
  );
};

export default ImageGallery;
