import type { ColoringBookDTO } from '@/services/pocketbase/coloring.service';

export interface ColoringBookCardData extends ColoringBookDTO {
  publisherName?: string;
  illustratorName?: string;
  completedPages?: number;
  completionPercentage?: number;
  lastActivityAt?: string;
}
