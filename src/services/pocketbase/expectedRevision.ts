export function expectedRevisionOptions(revision?: number) {
  if (revision === undefined) return undefined;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('Invalid expected revision.');
  }
  return { headers: { 'X-OG-Expected-Revision': String(revision) } };
}
