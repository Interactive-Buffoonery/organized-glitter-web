import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const publicEnvironmentExamples = new Set(['.env.example', 'config/official-site.env.example']);

export function isPrivateRuntimePath(path) {
  if (publicEnvironmentExamples.has(path)) return false;
  return (
    /(^|\/)(pb_data|local-pb-db|backups?|apple-auth-private|\.auth)(\/|$)/i.test(path) ||
    /(^|\/)\.env(?:\.|$)/i.test(path) ||
    /\.(env|p8|pem|key|db|sqlite|sqlite3|dump)(?:[.-].*)?$/i.test(path)
  );
}

export function checkPublicationFiles(directory = '.') {
  const git = (...args) =>
    execFileSync('git', args, { cwd: directory, maxBuffer: 256 * 1024 * 1024 });
  if (git('rev-parse', '--is-shallow-repository').toString().trim() !== 'false') {
    throw new Error('Publication checks require complete Git history.');
  }
  const paths = new Set([
    ...git('ls-files', '-z').toString().split('\0'),
    ...git('log', '--all', '--format=', '--name-only', '-z').toString().split('\0'),
  ]);
  const blocked = [...paths].filter(isPrivateRuntimePath);
  if (blocked.length) throw new Error(`Private runtime files in Git: ${blocked.join(', ')}`);

  const objects = git('rev-list', '--objects', '--all', '--no-object-names');
  const batch = execFileSync('git', ['cat-file', '--batch'], {
    cwd: directory,
    input: objects,
    maxBuffer: 256 * 1024 * 1024,
  });
  let offset = 0;
  while (offset < batch.length) {
    const end = batch.indexOf(10, offset);
    const [id, type, sizeText] = batch.subarray(offset, end).toString().split(' ');
    const size = Number(sizeText);
    if (end < 0 || !Number.isSafeInteger(size) || size < 0 || end + size + 2 > batch.length) {
      throw new Error('Cannot inspect Git objects for publication.');
    }
    if (
      type === 'blob' &&
      batch.subarray(end + 1, end + 17).equals(Buffer.from('SQLite format 3\0'))
    ) {
      throw new Error(`SQLite database in Git history: ${id}`);
    }
    offset = end + size + 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkPublicationFiles(process.argv[2]);
    process.stdout.write('Publication file and database checks passed.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
