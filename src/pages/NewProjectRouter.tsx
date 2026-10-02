import { Navigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '@/hooks/useAuth';
import { useEnabledVerticals } from '@/hooks/useEnabledVerticals';
import { usePageMetadata } from '@/hooks/usePageMetadata';

import NewColoringBook from './NewColoringBook';
import NewProject from './NewProject';

const NewProjectRouter = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { diamond_painting, coloring_books, isLoading } = useEnabledVerticals(user?.id);
  const craft = searchParams.get('craft') === 'coloring' ? 'coloring' : 'diamond';
  usePageMetadata({
    title:
      craft === 'coloring'
        ? 'New coloring book | Organized Glitter'
        : 'New project | Organized Glitter',
  });

  if (isLoading) {
    return null;
  }

  if (craft !== 'coloring') {
    if (!diamond_painting && coloring_books) {
      return <Navigate to="/projects/new?craft=coloring" replace />;
    }

    if (!diamond_painting) {
      return <Navigate to="/dashboard" replace />;
    }

    return <NewProject />;
  }

  if (!coloring_books) {
    return diamond_painting ? (
      <Navigate to="/projects/new" replace />
    ) : (
      <Navigate to="/dashboard" replace />
    );
  }

  return <NewColoringBook />;
};

export default NewProjectRouter;
