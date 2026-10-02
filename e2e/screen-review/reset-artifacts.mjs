import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const reviewDir = path.join(rootDir, 'playwright-artifacts', 'screen-review');

await fs.rm(reviewDir, { recursive: true, force: true });
