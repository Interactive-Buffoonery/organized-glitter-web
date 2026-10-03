import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { removeSetupTargets, runSetup } from '../setup.mjs';

describe('setup script', () => {
  it('keeps missing setup targets non-fatal', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);

    await expect(
      removeSetupTargets({
        targets: ['node_modules', 'pnpm-lock.yaml'],
        remove,
      })
    ).resolves.toBeUndefined();

    expect(remove).toHaveBeenCalledWith('node_modules', { recursive: true, force: true });
    expect(remove).toHaveBeenCalledWith('pnpm-lock.yaml', { recursive: true, force: true });
  });

  it('does not run install after cleanup fails', async () => {
    const install = vi.fn();
    const removeTargets = vi.fn().mockRejectedValue(new Error('permission denied'));

    await expect(runSetup({ removeTargets, install })).rejects.toThrow('permission denied');

    expect(install).not.toHaveBeenCalled();
  });

  it('routes pnpm setup through the guarded helper', async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts.setup).toBe('node scripts/setup.mjs');
  });
});
