import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { AppProviders } from '@/components/layout/AppProviders';
import { BlogNavigation } from '@/components/layout/BlogNavigation';
import { queryClient } from '@/lib/queryClient';
import '@/index.css';

const root = document.getElementById('blog-navigation-root');
if (root) {
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <AppProviders>
        <BlogNavigation />
      </AppProviders>
    </QueryClientProvider>
  );
}
