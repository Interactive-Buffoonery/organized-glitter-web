import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(
  readFileSync(
    new URL('../../.github/workflows/spacefast-preview-request.yml', import.meta.url),
    'utf8'
  )
);
const commands = workflow.jobs.request.steps[0].run;
const sha = 'a'.repeat(40);
const repo = { full_name: 'Interactive-Buffoonery/organized-glitter-web' };
const event = {
  action: 'labeled',
  number: 42,
  label: { name: 'spacefast-preview' },
  pull_request: {
    number: 42,
    state: 'open',
    draft: false,
    head: { ref: 'dev', sha, repo },
    base: { ref: 'main', repo },
  },
};

test('dispatches only a labeled same-repository release with matching PR identity', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'og-preview-relay-'));
  const eventPath = path.join(directory, 'event.json');
  const scenarios = [
    event,
    { ...event, number: 43 },
    { ...event, label: { name: 'another-label' } },
    { ...event, pull_request: { ...event.pull_request, draft: true } },
    {
      ...event,
      pull_request: {
        ...event.pull_request,
        head: { ...event.pull_request.head, repo: { full_name: 'other/repo' } },
      },
    },
    {
      ...event,
      pull_request: { ...event.pull_request, head: { ...event.pull_request.head, sha: 'invalid' } },
    },
    {
      ...event,
      pull_request: { ...event.pull_request, base: { ...event.pull_request.base, ref: 'dev' } },
    },
  ];
  for (const [index, input] of scenarios.entries()) {
    writeFileSync(eventPath, JSON.stringify(input));
    const result = spawnSync(
      'bash',
      ['-eo', 'pipefail', '-c', `gh() { cat "$RUNNER_TEMP/preview-request.json"; }\n${commands}`],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GH_TOKEN: 'example',
          GITHUB_EVENT_PATH: eventPath,
          RUNNER_TEMP: directory,
          GITHUB_STEP_SUMMARY: path.join(directory, 'summary.md'),
        },
      }
    );
    if (index === 0) {
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        ref: 'main',
        inputs: { pr_number: '42', source_commit: sha },
      });
    } else assert.notEqual(result.status, 0, `scenario ${index} dispatched`);
  }
});
