/**
 * TestWrapper component - extracted for React Fast Refresh optimization
 * @author @serabi
 * @created 2025-08-02
 */

import React, { createContext, useContext, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

const TestContentContext = createContext<React.ReactNode>(null);

const TestContents = () => useContext(TestContentContext);

/**
 * Simple test wrapper that provides essential contexts
 */
const TestWrapper: React.FC<{
  children: React.ReactNode;
  queryClient: QueryClient;
  initialRoute?: string;
}> = ({ children, queryClient, initialRoute = '/' }) => {
  const [router] = useState(() =>
    createMemoryRouter([{ path: '*', element: <TestContents /> }], {
      initialEntries: [initialRoute],
    })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TestContentContext.Provider value={children}>
        <RouterProvider router={router} />
      </TestContentContext.Provider>
    </QueryClientProvider>
  );
};

export default TestWrapper;
