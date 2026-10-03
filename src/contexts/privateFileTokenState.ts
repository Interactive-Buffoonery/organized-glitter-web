import { createContext } from 'react';

export type FileToken = {
  userId: string;
  value: string;
  issuedAt: number;
  /** Request one shared refresh when an image fails with this token. */
  refreshOnError?: (failedToken: string) => Promise<string | null>;
};

export const PrivateFileTokenContext = createContext<FileToken | null>(null);
