import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const requiredJobs = [
  'scope',
  'static-checks',
  'unit-tests',
  'backend',
  'browser',
  'react-doctor',
  'publication-security',
];

const plannedJobs = ['backend', 'browser'];

const validatePlan = plan => {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('CI execution plan must be an object.');
  }
  if (plannedJobs.some(name => typeof plan[name] !== 'boolean')) {
    throw new Error('CI execution plan must select backend and browser jobs explicitly.');
  }
};

export function evaluateCiResult(needs, plan) {
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) {
    throw new Error('CI dependency results must be an object.');
  }
  validatePlan(plan);

  return [...new Set([...requiredJobs, ...Object.keys(needs)])].map(name => {
    const selected = plannedJobs.includes(name) ? plan[name] : true;
    const expectedResult = selected ? 'success' : 'skipped';
    return {
      name,
      passed: needs[name]?.result === expectedResult,
      selected,
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = evaluateCiResult(
      JSON.parse(process.env.CI_NEEDS || 'null'),
      JSON.parse(process.env.CI_PLAN || 'null')
    );
    const summary = [
      '## CI result',
      '',
      ...results.map(
        ({ name, passed, selected }) =>
          `- ${name}: ${passed ? (selected ? 'passed' : 'not selected') : 'failed or incomplete'}`
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
