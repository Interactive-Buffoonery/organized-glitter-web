import type { ReactNode } from 'react';

export function JournalThread({ children }: { children: ReactNode }) {
  return (
    <div className="border-primary/35 mt-6 ml-2 flex flex-col border-l-2 border-dashed pl-6">
      {children}
    </div>
  );
}
