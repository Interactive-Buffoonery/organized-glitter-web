import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const repository = 'Interactive-Buffoonery/organized-glitter-web';

export function selectDevCIRun(runs, commit) {
  return (
    runs
      .filter(
        run =>
          Number.isSafeInteger(run.id) &&
          run.id > 0 &&
          run.head_sha === commit &&
          run.head_branch === 'dev' &&
          run.event === 'push' &&
          run.path === '.github/workflows/ci.yml' &&
          run.repository?.full_name === repository &&
          run.head_repository?.full_name === repository
      )
      .sort((first, second) => second.id - first.id)[0]?.id ?? null
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const commit = process.env.SOURCE_COMMIT;
    if (!/^[0-9a-f]{40}$/.test(commit || '')) throw new Error('Pass a full dev commit SHA.');
    let runId;
    for (let attempt = 0; attempt < 12; attempt++) {
      const result = JSON.parse(
        execFileSync(
          'gh',
          [
            'api',
            `repos/${repository}/actions/workflows/ci.yml/runs?event=push&branch=dev&head_sha=${commit}&per_page=100`,
          ],
          { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
        )
      );
      runId = selectDevCIRun(result.workflow_runs, commit);
      if (runId) break;
      await setTimeout(5_000);
    }
    if (!runId) throw new Error('No push CI run was found for this dev commit.');
    if (!process.env.GITHUB_OUTPUT) throw new Error('Missing GitHub step output path.');
    appendFileSync(process.env.GITHUB_OUTPUT, `run_id=${runId}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
