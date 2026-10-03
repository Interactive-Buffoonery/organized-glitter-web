/**
 * Metadata Context Types
 * @author @serabi
 * @created 2025-08-02
 */

import type { Tag } from '@/types/tag';
import type { CompanyListItem } from '@/services/pocketbase/companies.service';
import type { ArtistListItem } from '@/services/pocketbase/artists.service';

/**
 * Individual resource loading states
 */
interface MetadataLoadingStates {
  companies: boolean;
  artists: boolean;
  tags: boolean;
}

/**
 * Individual resource error states
 */
interface MetadataErrorStates {
  companies: Error | null;
  artists: Error | null;
  tags: Error | null;
}

/**
 * Core metadata context type definition
 */
export interface MetadataContextType {
  /** Companies list (id + name only) */
  companies: CompanyListItem[];
  /** Artists list (id + name only) */
  artists: ArtistListItem[];
  /** Raw tags data */
  tags: Tag[];
  /** Derived company names array */
  companyNames: string[];
  /** Derived artist names array */
  artistNames: string[];
  /** Loading states for each resource */
  isLoading: MetadataLoadingStates;
  /** Error states for each resource */
  error: MetadataErrorStates;
}
