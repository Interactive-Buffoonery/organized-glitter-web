import { Link } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAppReady } from '@/hooks/useAppReady';

export function ColoringTrackerOff({ title }: { title: string }) {
  useAppReady();

  return (
    <MainLayout>
      <div className="container mx-auto space-y-6 px-4 py-6 lg:py-8">
        <h1 className="font-handwritten text-3xl leading-tight tracking-tight md:text-4xl">
          {title}
        </h1>
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p>The coloring tracker is off.</p>
            <Link to="/profile#vertical-coloring" className="text-link font-medium underline">
              Open tracker settings
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    </MainLayout>
  );
}
