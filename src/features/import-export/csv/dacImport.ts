import Papa from 'papaparse';

import type { ProjectCreateDTO } from '@/types/project';
import { safeDateString } from '@/utils/date/dateHelpers';

const DAC_PRODUCTS_HEADER = 'Products';
const DAC_DATE_HEADER = 'Date';
const DAC_PRODUCT_SPLIT_PATTERN = /,(?!\s)/;

interface DacCsvWarning {
  row: number;
  message: string;
}

export interface ParsedDacProject {
  title: string;
  company: 'Diamond Art Club';
  status: 'purchased';
  datePurchased?: string;
}

export interface DacCsvPreview {
  source: 'diamond-art-club';
  projectCount: number;
  skippedRowCount: number;
  duplicateProjectCount: number;
  firstTitles: string[];
  warnings: DacCsvWarning[];
  projects: ParsedDacProject[];
  note: string;
}

export interface DacExistingProjectMatch {
  title: string;
  company?: string;
  datePurchased?: string;
}

export interface DacProjectWithDuplicateStatus extends ParsedDacProject {
  duplicateReason?: 'existing-library' | 'same-file';
}

export function hasDacCsvHeaders(headers: string[]): boolean {
  const normalized = new Set(headers.map(header => header.trim().toLowerCase()));
  return (
    normalized.has(DAC_PRODUCTS_HEADER.toLowerCase()) &&
    normalized.has(DAC_DATE_HEADER.toLowerCase())
  );
}

function getCaseInsensitiveValue(row: Record<string, unknown>, header: string): string {
  const match = Object.entries(row).find(
    ([key]) => key.trim().toLowerCase() === header.toLowerCase()
  );
  const value = match?.[1];
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function splitRawProducts(products: string): string[] {
  return products
    .split(DAC_PRODUCT_SPLIT_PATTERN)
    .map(product => product.trim())
    .filter(Boolean);
}

export function parseDacCsvContent(csvContent: string): DacCsvPreview {
  if (!csvContent.trim()) {
    throw new Error('DAC CSV content is empty');
  }

  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields ?? [];
  if (!hasDacCsvHeaders(headers)) {
    throw new Error('Diamond Art Club CSV import requires Products and Date columns');
  }

  const projects: ParsedDacProject[] = [];
  const warnings: DacCsvWarning[] = [];
  let skippedRowCount = 0;

  parsed.data.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const products = getCaseInsensitiveValue(row, DAC_PRODUCTS_HEADER);
    const rawDate = getCaseInsensitiveValue(row, DAC_DATE_HEADER);

    if (!products) {
      skippedRowCount += 1;
      return;
    }

    const parsedDate = rawDate ? safeDateString(rawDate) || undefined : undefined;
    if (rawDate && !parsedDate) {
      warnings.push({
        row: rowNumber,
        message: `Could not parse "${rawDate}" as an order date.`,
      });
    }

    const rawTitles = splitRawProducts(products);
    const titles = rawTitles.filter(product => product.length > 1);
    const skippedProductCount = rawTitles.length - titles.length;
    if (skippedProductCount > 0) {
      warnings.push({
        row: rowNumber,
        message: `Ignored ${skippedProductCount} invalid product value${skippedProductCount === 1 ? '' : 's'}.`,
      });
    }

    if (titles.length === 0) {
      skippedRowCount += 1;
      return;
    }

    titles.forEach(title => {
      projects.push({
        title,
        company: 'Diamond Art Club',
        status: 'purchased',
        datePurchased: parsedDate,
      });
    });
  });

  const uniqueProjectKeys = new Set(projects.map(dacProjectDuplicateKey));

  return {
    source: 'diamond-art-club',
    projectCount: projects.length,
    skippedRowCount,
    duplicateProjectCount: projects.length - uniqueProjectKeys.size,
    firstTitles: projects.slice(0, 5).map(project => project.title),
    warnings,
    projects,
    note: 'Diamond Art Club CSV does not include photo files.',
  };
}

function dacProjectDuplicateKey(project: DacExistingProjectMatch): string {
  return [
    project.title.trim().toLowerCase(),
    (project.company ?? '').trim().toLowerCase(),
    project.datePurchased ?? '',
  ].join('|');
}

export function markDacDuplicateProjects(
  projects: ParsedDacProject[],
  existingProjects: DacExistingProjectMatch[]
): DacProjectWithDuplicateStatus[] {
  const existingKeys = new Set(existingProjects.map(dacProjectDuplicateKey));
  const seenImportKeys = new Set<string>();

  return projects.map(project => {
    const key = dacProjectDuplicateKey(project);
    const duplicateReason = existingKeys.has(key)
      ? 'existing-library'
      : seenImportKeys.has(key)
        ? 'same-file'
        : undefined;

    seenImportKeys.add(key);
    return duplicateReason ? { ...project, duplicateReason } : project;
  });
}

export async function parseDacCsvFile(file: File): Promise<DacCsvPreview> {
  const text =
    typeof file.text === 'function'
      ? await file.text()
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(reader.error ?? new Error('Could not read DAC CSV file'));
          reader.readAsText(file);
        });

  return parseDacCsvContent(text);
}

export function mapDacProjectToCreateDTO(
  project: ParsedDacProject,
  userId: string
): ProjectCreateDTO {
  return {
    userId,
    title: project.title,
    company: project.company,
    status: project.status,
    datePurchased: project.datePurchased,
    kitCategory: 'full',
  };
}
