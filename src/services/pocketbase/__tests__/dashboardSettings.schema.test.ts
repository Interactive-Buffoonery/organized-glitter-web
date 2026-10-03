import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const schema = JSON.parse(
  readFileSync(join(process.cwd(), 'docs/pocketbase/collections.schema.json'), 'utf8')
) as Array<{ name: string; indexes: string[] }>;

const migration = readFileSync(
  join(process.cwd(), 'pb_migrations/1788705263_updated_user_dashboard_settings.js'),
  'utf8'
);

describe('user dashboard settings schema', () => {
  it('allows only one settings row per user', () => {
    const collection = schema.find(item => item.name === 'user_dashboard_settings');

    expect(collection?.indexes).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS `idx_user_dashboard_settings_user` ON `user_dashboard_settings` (`user`)'
    );
  });

  it('refuses to guess how duplicate settings rows should merge', () => {
    expect(migration).toContain('GROUP BY user');
    expect(migration).toContain('HAVING COUNT(*) > 1');
    expect(migration).toContain('duplicate user rows require manual review');
    expect(migration).not.toMatch(/DELETE\s+FROM\s+user_dashboard_settings/i);
  });
});
