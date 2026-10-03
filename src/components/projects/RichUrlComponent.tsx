import React, { useState } from 'react';
import { logger } from '@/utils/logger';
import { getSafeHref } from '@/utils/ui/urlSanitizer';
import { ExternalLink, Copy, Link, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RichUrlComponentProps {
  url: string;
  className?: string;
  showCopyButton?: boolean;
}

const RichUrlComponent: React.FC<RichUrlComponentProps> = ({
  url,
  className = '',
  showCopyButton = true,
}) => {
  const [copied, setCopied] = useState(false);

  // Parse and clean URL using the centralized sanitizer
  const parseUrl = (inputUrl: string) => {
    try {
      // Add protocol if missing
      const urlWithProtocol = inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`;

      // Validate protocol is http: or https: using centralized sanitizer
      const safeUrl = getSafeHref(urlWithProtocol);
      if (!safeUrl) {
        return { fullUrl: url, domain: '', displayUrl: url, isValid: false };
      }

      const urlObj = new URL(safeUrl);
      const domain = urlObj.hostname;
      const displayUrl = domain.replace(/^www\./, '');

      return {
        fullUrl: safeUrl,
        domain,
        displayUrl,
        isValid: true,
      };
    } catch {
      return {
        fullUrl: url,
        domain: '',
        displayUrl: url,
        isValid: false,
      };
    }
  };

  // Generate site name from domain
  const generateSiteName = (domain: string) => {
    if (!domain) return '';

    // Remove common TLDs and split by dots
    const parts = domain.replace(/\.(com|net|org|co\.uk|co|io|app)$/, '').split('.');

    // Take the main domain part (last part before TLD)
    const mainPart = parts[parts.length - 1];

    // Convert to title case
    return mainPart
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Copy URL to clipboard
  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await navigator.clipboard.writeText(parsedUrl.fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      logger.error('Failed to copy URL:', error);
    }
  };

  const parsedUrl = parseUrl(url);
  const siteName = generateSiteName(parsedUrl.domain);

  if (!url.trim()) {
    return null;
  }

  return (
    <div className={`group relative ${className}`}>
      {parsedUrl.isValid ? (
        <a
          href={parsedUrl.fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="border-border hover:border-accent/20 hover:bg-muted/50 flex items-start gap-3 rounded-lg border p-3 pr-11 transition-all duration-200"
        >
          <div className="mt-0.5 flex-shrink-0">
            <Link className="text-muted-foreground size-4" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-foreground truncate text-sm font-medium">
                {parsedUrl.displayUrl}
              </span>
              <ExternalLink className="text-muted-foreground size-3 flex-shrink-0" />
            </div>
            {siteName && <div className="text-muted-foreground mt-0.5 text-xs">{siteName}</div>}
          </div>
        </a>
      ) : (
        <div className="border-border flex cursor-default items-start gap-3 rounded-lg border p-3 transition-all duration-200">
          <div className="mt-0.5 flex-shrink-0">
            <Link className="text-muted-foreground size-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-foreground truncate text-sm font-medium">
                {parsedUrl.displayUrl}
              </span>
            </div>
            <div className="text-destructive-text mt-0.5 text-xs">Invalid URL format</div>
          </div>
        </div>
      )}

      {/* Copy button */}
      {showCopyButton && parsedUrl.isValid && (
        <Button
          type="button"
          onClick={handleCopy}
          size="icon"
          variant="ghost"
          className="absolute top-3 right-3 size-6 flex-shrink-0 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-3"
          title="Copy URL"
        >
          {copied ? (
            <Check className="text-green-500" />
          ) : (
            <Copy className="text-muted-foreground" />
          )}
        </Button>
      )}
    </div>
  );
};

export default RichUrlComponent;
