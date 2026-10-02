import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { BookTaxonomyListTab } from '@/components/profile/BookTaxonomyListTab';
import { useAppReady } from '@/hooks/useAppReady';

export default function BookPublisherList() {
  useAppReady();
  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 pointer-coarse:min-h-11"
          >
            <Link to="/options">
              <ChevronLeft className="size-4" />
              Back to Manage Lists
            </Link>
          </Button>
        </div>

        <BookTaxonomyListTab kind="publishers" />
      </div>
    </MainLayout>
  );
}
