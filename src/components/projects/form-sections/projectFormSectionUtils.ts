import type { ProjectFormValues } from '@/types/project';

export const getErrorId = (field: keyof ProjectFormValues) => `${field}-error`;
