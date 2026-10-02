import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy } from './local-build-server.js';

describe('Spacefast response headers', () => {
  it('uses the same content security policy as the local build server', async () => {
    const headers = await fs.readFile(path.resolve('public/_headers'), 'utf8');

    expect(headers).toContain(`  Content-Security-Policy: ${buildContentSecurityPolicy({})}\n`);
    expect(buildContentSecurityPolicy({})).not.toContain('organizedglitter.app');
    expect(headers).toContain('  X-Frame-Options: DENY\n');
    expect(headers).toContain(
      '/updates/_astro/*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable\n'
    );
  });
});
