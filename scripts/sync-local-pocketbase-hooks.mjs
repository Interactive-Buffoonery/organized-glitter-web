import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export function syncLocalPocketBaseHooks(rootDir, localDir) {
  const rootHooksDir = path.join(rootDir, 'pb_hooks');
  if (!existsSync(rootHooksDir)) return;

  const localHooksDir = path.join(localDir, 'pb_hooks');
  mkdirSync(localHooksDir, { recursive: true });

  const hookFiles = readdirSync(rootHooksDir).filter(file => file.endsWith('.js'));
  const localHookFiles = readdirSync(localHooksDir).filter(file => file.endsWith('.js'));
  const extraLocalHooks = localHookFiles.filter(file => !hookFiles.includes(file));
  if (extraLocalHooks.length > 0) {
    throw new Error(
      [
        `${path.relative(rootDir, localHooksDir)} contains hook files that are not in repo-root pb_hooks/:`,
        ...extraLocalHooks.map(file => `- ${file}`),
        'Move or trash these local files before starting PocketBase.',
      ].join('\n')
    );
  }

  for (const file of hookFiles) {
    copyFileSync(path.join(rootHooksDir, file), path.join(localHooksDir, file));
  }

  console.log(
    `Synced ${hookFiles.length} hook files into ${path.relative(rootDir, localHooksDir)}.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const rootDir = process.cwd();
    const localDir = path.resolve(rootDir, process.env.LOCAL_POCKETBASE_DIR || 'local-pb-db');
    syncLocalPocketBaseHooks(rootDir, localDir);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
