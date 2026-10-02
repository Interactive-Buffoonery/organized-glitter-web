import {
  ColoringMediumsTypeOptions,
  type ColoringMediumsTypeOptions as ColoringMediumsType,
} from '@/types/pocketbase.types';

export const ColoringMediumTypeOptions = ColoringMediumsTypeOptions;

export type ColoringMediumType = ColoringMediumsType;

export interface ColoringMediumRecord {
  id: string;
  userId: string;
  name: string;
  type: ColoringMediumType;
  brand: string;
  colorCount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ColoringMediumFormValues {
  name: string;
  type: ColoringMediumType;
  brand: string;
  colorCount: string;
  notes: string;
}
