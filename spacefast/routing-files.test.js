import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8')
  .split('\n')
  .map(line => line.trim().split(/\s+/));

describe('Spacefast routing files', () => {
  // Clean URLs answer /app.html with a 308 unless a rule names it. Older service workers refetch
  // /app.html when their precache is missing it, and browsers reject redirected navigations.
  it('keeps the app shell file URL answering directly', () => {
    expect(redirects).toContainEqual(['/app', '/app.html', '200']);
  });
});
