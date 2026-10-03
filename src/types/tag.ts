export interface Tag {
  id: string;
  userId: string;
  name: string;
  slug: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagFormValues {
  name: string;
  color?: string;
}

export interface TagFilterOptions {
  search?: string;
  excludeTagIds?: string[];
}
