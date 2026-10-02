import { Link } from 'react-router-dom';

import { UPDATES_URL } from '@/constants/updates';

interface SiteFooterProps {
  currentPage?: string;
}

const footerLinks = [
  { label: 'Privacy', page: 'Privacy', path: '/privacy' },
  { label: 'Terms', page: 'Terms', path: '/terms' },
  { label: 'About', page: 'About', path: '/about' },
  { label: 'Links', page: 'Links', path: '/links' },
] as const;

export function SiteFooter({ currentPage = '' }: SiteFooterProps) {
  const year = new Date().getFullYear();
  const source =
    import.meta.env.VITE_SOURCE_URL ||
    'https://github.com/Interactive-Buffoonery/organized-glitter-web';

  return (
    <footer className="border-border/40 bg-background/60 border-t backdrop-blur-sm">
      <div className="text-muted-foreground container mx-auto flex flex-col items-center justify-between gap-3 px-4 py-8 text-sm md:flex-row">
        <span>&copy; {year} Organized Glitter</span>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {footerLinks.map(({ label, page, path }) =>
            currentPage === page ? (
              <span key={page} aria-current="page" className="text-foreground pointer-events-none">
                {label}
              </span>
            ) : (
              <Link
                key={page}
                to={path}
                className="hover:text-foreground inline-flex min-h-11 items-center"
              >
                {label}
              </Link>
            )
          )}
          {UPDATES_URL && (
            <a
              href={UPDATES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground inline-flex min-h-11 items-center"
            >
              Updates
            </a>
          )}
          <a href={source} className="hover:text-foreground inline-flex min-h-11 items-center">
            Source code
          </a>
        </div>
      </div>
    </footer>
  );
}
