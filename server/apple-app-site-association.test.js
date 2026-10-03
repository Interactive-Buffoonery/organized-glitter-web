import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const associationPath = path.join(
  process.cwd(),
  'public',
  '.well-known',
  'apple-app-site-association'
);

describe('Apple app site association', () => {
  it('associates only the canonical password reset path with the signed iOS app', async () => {
    const association = JSON.parse(await fs.readFile(associationPath, 'utf8'));

    expect(association).toEqual({
      applinks: {
        details: [
          {
            appID: '7CNK4YPCQX.com.interactivebuffoonery.organizedglitter',
            components: [
              {
                '/': '/auth/confirm-password-reset/*',
                comment: 'Open Organized Glitter password reset links in the iOS app.',
              },
            ],
          },
        ],
      },
    });
  });
});
