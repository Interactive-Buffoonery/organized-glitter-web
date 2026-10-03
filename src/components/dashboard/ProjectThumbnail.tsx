import React, { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logger } from '@/utils/logger';
import { PrivateFileImage } from '@/components/image/PrivateFileImage';

interface ProjectThumbnailProps {
  imageUrl?: string;
  title: string;
  skipImageLoading?: boolean;
}

const ProjectThumbnail = ({ imageUrl, title, skipImageLoading = false }: ProjectThumbnailProps) => {
  if (skipImageLoading || !imageUrl) {
    return (
      <div className="bg-muted flex size-full items-center justify-center">
        <ImageIcon className="text-muted-foreground size-12" />
      </div>
    );
  }

  return <ProjectThumbnailImage key={imageUrl} imageUrl={imageUrl} title={title} />;
};

const ProjectThumbnailImage = ({
  imageUrl,
  title,
}: Required<Pick<ProjectThumbnailProps, 'imageUrl' | 'title'>>) => {
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);

  if (hasImageError) {
    return (
      <div className="bg-muted text-muted-foreground flex size-full flex-col items-center justify-center p-2">
        <ImageIcon className="mb-2 size-8" />
        <p className="text-center text-xs">Failed to load</p>
      </div>
    );
  }

  return (
    <PrivateFileImage
      src={imageUrl}
      alt={title}
      loading="lazy"
      decoding="async"
      className={cn(
        'size-full object-cover transition-opacity duration-300 ease-in-out',
        isImageLoaded ? 'opacity-100' : 'opacity-0'
      )}
      onLoad={() => setIsImageLoaded(true)}
      onError={() => {
        logger.error('Image render error:', { imageUrl });
        setIsImageLoaded(true);
        setHasImageError(true);
      }}
    />
  );
};

export default React.memo(ProjectThumbnail);
