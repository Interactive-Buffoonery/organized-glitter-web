import { Hash } from 'fast-sha256';
import type {
  ArchiveItemV3,
  ArchiveParentDescriptorV3,
  ArchivePartManifestV3,
  Sha256,
} from './types';

function normalize(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Canonical JSON does not allow non-finite numbers');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') throw new Error('Canonical JSON contains an unsupported value');
  if (seen.has(value)) throw new Error('Canonical JSON does not allow cycles');
  seen.add(value);
  if (Array.isArray(value)) {
    const output = value.map(entry => normalize(entry, seen));
    seen.delete(value);
    return output;
  }
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as object).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry !== undefined) output[key] = normalize(entry, seen);
  }
  seen.delete(value);
  return output;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, new Set()));
}

export function bytesToHex(bytes: Uint8Array): Sha256 {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
export function sha256Bytes(bytes: Uint8Array): Sha256 {
  return bytesToHex(new Hash().update(bytes).digest());
}
function sha256Canonical(value: unknown): Sha256 {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(value)));
}
export function calculateItemDigest(item: Omit<ArchiveItemV3, 'digest'>): Sha256 {
  return sha256Canonical(item);
}
export function calculateParentDescriptorDigest(
  descriptor: Omit<ArchiveParentDescriptorV3, 'digest'>
): Sha256 {
  return sha256Canonical({ ...descriptor, assets: [] });
}
export function calculateInventoryDigest(
  manifest: Omit<ArchivePartManifestV3, 'inventoryDigest'>
): Sha256 {
  return sha256Canonical(manifest);
}
