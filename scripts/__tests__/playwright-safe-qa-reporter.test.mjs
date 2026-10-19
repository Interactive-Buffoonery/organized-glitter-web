import { describe, expect, it } from 'vitest';

import { validateManagedPlaywrightReport } from '../run-local-release-qa.mjs';
import SafeQaReporter from '../playwright-safe-qa-reporter.mjs';

const makeTests = (password, failFirst, count = 95) =>
  Array.from({ length: count }, (_, index) => ({
    title: `managed test ${index}`,
    location: { file: `/repo/e2e/authenticated/managed-${index}.spec.ts` },
    parent: { project: () => ({ name: 'authenticated-chromium-smoke' }) },
    expectedStatus: 'passed',
    annotations: [],
    results: [
      {
        status: failFirst && index === 0 ? 'failed' : 'passed',
        retry: 0,
        annotations: [],
        errors: [{ message: `credential ${password}` }],
        attachments: [{ body: Buffer.from(password) }],
      },
    ],
    outcome: () => (failFirst && index === 0 ? 'unexpected' : 'expected'),
    titlePath: () => ['', 'authenticated-chromium-smoke', 'managed', `managed test ${index}`],
  }));

describe('safe managed Playwright report', () => {
  it.each([false, true])('retains counts and status without failure payloads (%s)', failFirst => {
    const password = 'injected-credential-do-not-retain';
    let retained = '';
    const reporter = new SafeQaReporter({
      outputFile: '/tmp/safe-results.json',
      env: {
        LOCAL_POCKETBASE_ADMIN_EMAIL: 'admin@localhost.test',
        LOCAL_POCKETBASE_ADMIN_PASSWORD: password,
      },
      writeFile: (_path, content) => {
        retained = content;
      },
    });
    reporter.onBegin({}, { allTests: () => makeTests(password, failFirst) });
    reporter.onEnd({ status: failFirst ? 'failed' : 'passed' });

    expect(retained.includes(password)).toBe(false);
    expect(retained.includes('credential ')).toBe(false);
    expect(retained.includes('attachments')).toBe(false);
    const report = JSON.parse(retained);
    expect(report.stats.expected).toBe(failFirst ? 94 : 95);
    expect(report.stats.unexpected).toBe(failFirst ? 1 : 0);
    expect(report.runStatus).toBe(failFirst ? 'failed' : 'passed');
    if (failFirst) {
      expect(() => validateManagedPlaywrightReport(report, 'smoke')).toThrow();
    } else {
      expect(validateManagedPlaywrightReport(report, 'smoke')).toEqual({
        expected: 95,
        skipped: 0,
        total: 95,
      });
    }
  });

  it('fails closed for a global runner failure even if every test passed', () => {
    let retained = '';
    const reporter = new SafeQaReporter({
      outputFile: '/tmp/safe-results.json',
      writeFile: (_path, content) => {
        retained = content;
      },
    });
    reporter.onBegin({}, { allTests: () => makeTests('no-output-secret', false) });
    reporter.onError(new Error('credential no-output-secret'));
    reporter.onEnd({ status: 'failed' });
    const report = JSON.parse(retained);
    expect(report.errors).toHaveLength(1);
    expect(retained.includes('no-output-secret')).toBe(false);
    expect(() => validateManagedPlaywrightReport(report, 'smoke')).toThrow();
  });

  it('preserves the one permitted full-suite skip and exact counts', () => {
    let retained = '';
    const tests = makeTests('unused', false, 310);
    const allowedSkip = tests.at(-1);
    allowedSkip.title = 'bottom nav remains anchored during scroll';
    allowedSkip.location.file = '/repo/e2e/authenticated/mobile-touch-targets.spec.ts';
    allowedSkip.parent.project = () => ({ name: 'authenticated-chromium-full' });
    allowedSkip.expectedStatus = 'skipped';
    allowedSkip.annotations = [
      { type: 'skip', description: 'page too short to verify bottom nav scroll anchoring' },
    ];
    allowedSkip.results = [];
    allowedSkip.outcome = () => 'skipped';
    allowedSkip.titlePath = () => [
      '',
      'authenticated-chromium-full',
      'mobile-touch-targets.spec.ts',
      'mobile touch targets',
      allowedSkip.title,
    ];
    const reporter = new SafeQaReporter({
      outputFile: '/tmp/safe-results.json',
      writeFile: (_path, content) => {
        retained = content;
      },
    });
    reporter.onBegin({}, { allTests: () => tests });
    reporter.onEnd({ status: 'passed' });

    expect(validateManagedPlaywrightReport(JSON.parse(retained), 'full')).toEqual({
      expected: 309,
      skipped: 1,
      total: 310,
    });
  });
});
