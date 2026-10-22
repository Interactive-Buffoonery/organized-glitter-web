import { writeFileSync } from 'node:fs';

import { redactQaCredentials } from './run-local-release-qa.mjs';

const safeAnnotations = annotations =>
  (annotations || []).map(({ type, description }) => ({ type, description }));

export default class SafeQaReporter {
  constructor({ outputFile, env = process.env, writeFile = writeFileSync } = {}) {
    this.outputFile = outputFile;
    this.env = env;
    this.writeFile = writeFile;
    this.globalErrorCount = 0;
  }

  onBegin(_config, suite) {
    this.suite = suite;
  }

  onError() {
    this.globalErrorCount += 1;
  }

  onEnd(result) {
    if (!this.outputFile) return;
    const tests = this.suite?.allTests() || [];
    const outcomes = { expected: 0, skipped: 0, unexpected: 0, flaky: 0 };
    const specs = tests.map(test => {
      const status = test.outcome();
      outcomes[status] += 1;
      return {
        title: test.titlePath().slice(3).join(' › ') || test.title,
        file: test.location.file,
        tests: [
          {
            projectName: test.parent.project()?.name,
            expectedStatus: test.expectedStatus,
            status,
            annotations: safeAnnotations(test.annotations),
            results: test.results.map(run => ({
              status: run.status,
              retry: run.retry,
              annotations: safeAnnotations(run.annotations),
            })),
          },
        ],
      };
    });
    const report = {
      runStatus: result.status,
      suites: [{ title: 'managed', specs }],
      errors: Array.from({ length: this.globalErrorCount }, () => ({ type: 'global' })),
      stats: outcomes,
    };
    this.writeFile(this.outputFile, redactQaCredentials(JSON.stringify(report), this.env), {
      mode: 0o600,
    });
  }
}
