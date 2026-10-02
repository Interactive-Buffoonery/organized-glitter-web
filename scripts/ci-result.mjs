import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const requiredJobs = [
  'static-checks',
  'unit-tests',
  'build',
  'backend',
  'browser',
  'react-doctor',
];

export function evaluateCiResult(needs) {
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) {
    throw new Error('CI dependency results must be an object.');
  }

  return [...new Set([...requiredJobs, ...Object.keys(needs)])].map(name => ({
    name,
    passed: needs[name]?.result === 'success',
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = evaluateCiResult(JSON.parse(process.env.CI_NEEDS || 'null'));
    const summary = [
      '## CI result',
      '',
      ...results.map(
        ({ name, passed }) => `- ${name}: ${passed ? 'passed' : 'failed or incomplete'}`
      ),
      '',
    ].join('\n');
    process.stdout.write(summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    process.exitCode = results.every(result => result.passed) ? 0 : 1;
  } catch {
    process.stderr.write('Cannot validate CI dependency results.\n');
    process.exitCode = 1;
  }
}
