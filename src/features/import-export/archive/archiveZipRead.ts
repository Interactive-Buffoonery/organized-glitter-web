import type JSZip from 'jszip';

export const MAX_ARCHIVE_MANIFEST_BYTES = 64 * 1024 * 1024;

type EntryStream = {
  on(event: 'data', callback: (chunk: Uint8Array) => void): void;
  on(event: 'error', callback: (error: unknown) => void): void;
  on(event: 'end', callback: () => void): void;
  pause(): void;
  resume(): void;
};
export function entryStream(entry: JSZip.JSZipObject): EntryStream {
  return (entry as unknown as { internalStream(type: 'uint8array'): EntryStream }).internalStream(
    'uint8array'
  );
}

function readBoundedBytes(
  entry: JSZip.JSZipObject,
  maxEntryBytes: number,
  budget?: { expandedBytes: number },
  maxExpandedBytes = Infinity
): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let entryBytes = 0;
    const stream = entryStream(entry);
    stream.on('data', chunk => {
      entryBytes += chunk.byteLength;
      if (budget) budget.expandedBytes += chunk.byteLength;
      if (entryBytes > maxEntryBytes || (budget && budget.expandedBytes > maxExpandedBytes)) {
        stream.pause();
        reject(
          new Error(
            entryBytes > maxEntryBytes
              ? `Archive entry ${entry.name} is too large`
              : 'Archive expanded data is too large'
          )
        );
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      const bytes = new Uint8Array(entryBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(bytes);
    });
    stream.resume();
  });
}

export function readBoundedText(
  entry: JSZip.JSZipObject,
  maxBytes: number,
  budget?: { expandedBytes: number },
  maxExpandedBytes = Infinity
): Promise<string> {
  return readBoundedBytes(entry, maxBytes, budget, maxExpandedBytes).then(bytes =>
    new TextDecoder().decode(bytes)
  );
}

export function readBoundedBlob(
  entry: JSZip.JSZipObject,
  maxEntryBytes: number,
  budget: { expandedBytes: number },
  maxExpandedBytes: number
): Promise<Blob> {
  return readBoundedBytes(entry, maxEntryBytes, budget, maxExpandedBytes).then(
    bytes => new Blob([bytes])
  );
}
