import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RandomizerPageHeader() {
  return (
    <header className="mb-4 sm:mb-6">
      <div className="mb-2 sm:mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 pointer-coarse:min-h-11">
          <Link to="/dashboard">
            <ChevronLeft className="size-4" />
            Back to Library
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-handwritten text-3xl leading-tight tracking-tight md:text-4xl">
            Randomizer
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Pick some or all of your in-progress projects and spin the wheel!
          </p>
        </div>
      </div>
    </header>
  );
}
