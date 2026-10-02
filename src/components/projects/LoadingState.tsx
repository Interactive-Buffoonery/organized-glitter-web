import React from 'react';

interface LoadingStateProps {
  message?: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Loading...' }) => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4 text-center">
        <p className="text-muted-foreground text-lg">{message}</p>
      </div>
      <div className="animate-pulse space-y-6">
        <div className="bg-muted h-8 w-1/4 rounded"></div>
        <div className="bg-muted h-64 rounded"></div>
        <div className="space-y-3">
          <div className="bg-muted h-6 w-1/2 rounded"></div>
          <div className="bg-muted h-4 w-3/4 rounded"></div>
          <div className="bg-muted h-4 w-1/3 rounded"></div>
        </div>
      </div>
    </div>
  );
};

export default LoadingState;
