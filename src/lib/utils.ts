import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines multiple class value inputs into a single Tailwind-ready class string.
 *
 * @param inputs - Class value arguments (strings, arrays, objects, etc.) accepted by clsx
 * @returns A single className string with Tailwind-style class conflicts resolved
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const numberFormatter = new Intl.NumberFormat();

export function formatStatsNumber(value: number | null | undefined): string {
  return numberFormatter.format(value ?? 0);
}

export function formatStatsDays(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const rounded = Math.round(value * 10) / 10;
  return `${numberFormatter.format(rounded)} days`;
}
