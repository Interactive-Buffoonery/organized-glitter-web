// PocketBase user record type
export interface PocketBaseUser {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  avatar?: string;
  beta_tester?: boolean;
  theme_preference?: string;
  timezone?: string;
  created: string;
  updated: string;
  verified?: boolean;
  coloring_walkthrough_seen?: boolean;
}

export interface AuthContextType {
  user: PocketBaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  initialCheckComplete: boolean;
  signOut: () => Promise<{ success: boolean; error: Error | null }>;
}

export interface AuthProviderProps {
  children: React.ReactNode;
}
