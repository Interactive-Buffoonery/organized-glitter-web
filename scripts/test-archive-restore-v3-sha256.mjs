import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const hookPath = path.resolve(process.cwd(), 'pb_hooks/archive_restore_v3.pb.js');
const source = await readFile(hookPath, 'utf8');
const marker = 'const createBinarySha256 = () => {';
const start = source.indexOf(marker);
assert.notEqual(start, -1, 'hook SHA-256 implementation must exist');

let depth = 0;
let end = -1;
let sawBrace = false;
for (let index = start + marker.indexOf('{'); index < source.length; index += 1) {
  if (source[index] === '{') {
    depth += 1;
    sawBrace = true;
  } else if (source[index] === '}') {
    depth -= 1;
    if (sawBrace && depth === 0) {
      end = index + 1;
      break;
    }
  }
}
assert.notEqual(end, -1, 'hook SHA-256 implementation must have balanced braces');
const declaration = source.slice(start, end);
const createBinarySha256 = vm.runInNewContext(
  `(() => { ${declaration}; return createBinarySha256; })()`
);

function deployedDigest(bytes, chunkSizes) {
  const hasher = createBinarySha256();
  let offset = 0;
  let chunkIndex = 0;
  while (offset < bytes.length) {
    const requested = chunkSizes[chunkIndex % chunkSizes.length];
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + requested));
    hasher.update(chunk, chunk.length);
    offset += chunk.length;
    chunkIndex += 1;
  }
  return hasher.digest();
}

for (const length of [0, 1, 55, 56, 63, 64, 65, 65535, 65536, 65537, 200000]) {
  const bytes = Buffer.alloc(length);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 131 + 17) & 255;
  const expected = createHash('sha256').update(bytes).digest('hex');
  for (const chunks of [[65536], [1], [3, 61, 64, 65, 8191]]) {
    assert.equal(deployedDigest(bytes, chunks), expected, `length=${length}, chunks=${chunks}`);
  }
}

console.log('archive restore v3 SHA-256 vectors passed');
