import { pb } from '@/lib/pocketbase';

export type PocketBaseFilterValue = string | number | boolean | null | undefined;

export type PocketBaseFilterParams = Record<string, PocketBaseFilterValue>;

declare const pocketBaseFilterBrand: unique symbol;

export type PocketBaseFilter = string & { readonly [pocketBaseFilterBrand]: true };

export function toPocketBaseFilter(filter: string): PocketBaseFilter {
  return filter as PocketBaseFilter;
}

export function pbFilter(
  expression: string,
  params: PocketBaseFilterParams = {}
): PocketBaseFilter {
  if (!expression.trim()) {
    return toPocketBaseFilter('');
  }

  return toPocketBaseFilter(pb.filter(expression, params));
}
