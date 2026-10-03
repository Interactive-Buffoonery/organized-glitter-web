import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const ProjectNotFound = () => {
  return (
    <div className="container mx-auto px-4 py-8 text-center">
      <h1 className="mb-4 text-2xl font-semibold">Project Not Found</h1>
      <p className="text-muted-foreground mb-6">
        The project you're looking for doesn't exist or has been removed.
      </p>
      <Link to="/dashboard">
        <Button variant="glass">Return to Library</Button>
      </Link>
    </div>
  );
};

export default ProjectNotFound;
