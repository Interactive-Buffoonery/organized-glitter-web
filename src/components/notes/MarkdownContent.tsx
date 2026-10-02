import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';
import { sanitizeMarkdownUrl } from './markdown-url';
import type { MarkdownString } from '@/types/markdown';

interface MarkdownContentProps {
  content: MarkdownString;
  className?: string;
}

const MarkdownContent = ({ content, className }: MarkdownContentProps) => {
  if (!content.trim()) {
    return null;
  }

  return (
    <div className={cn('text-foreground space-y-2 text-base leading-relaxed', className)}>
      <ReactMarkdown
        allowedElements={['a', 'br', 'del', 'em', 'h3', 'li', 'ol', 'p', 'strong', 'ul']}
        remarkPlugins={[remarkGfm, remarkBreaks]}
        skipHtml
        unwrapDisallowed
        urlTransform={url => sanitizeMarkdownUrl(url)}
        components={{
          a: ({ children, href }) =>
            href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-link underline-offset-4 hover:underline"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          h3: ({ children }) => (
            <h3 className="text-foreground mt-3 text-xl leading-snug font-semibold">{children}</h3>
          ),
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
          del: ({ children }) => <del className="text-muted-foreground">{children}</del>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;
