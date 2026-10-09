export type CountUnit = 'page' | 'painting';

export const countUnit = (count: number | undefined, unit: CountUnit): string =>
  count === 1 ? unit : `${unit}s`;
