import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const vitestConfig = readFileSync(resolve(process.cwd(), 'vitest.config.ts'), 'utf8');
const sourceFile = ts.createSourceFile(
  'vitest.config.ts',
  vitestConfig,
  ts.ScriptTarget.Latest,
  true
);

function propertyName(node: ts.PropertyName) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

function findTestExcludeEntries(node: ts.Node): string[] | undefined {
  if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'test') {
    const testConfig = node.initializer;
    if (!ts.isObjectLiteralExpression(testConfig)) return undefined;

    const excludeProperty = testConfig.properties.find(
      property =>
        ts.isPropertyAssignment(property) &&
        propertyName(property.name) === 'exclude' &&
        ts.isArrayLiteralExpression(property.initializer)
    );

    if (!excludeProperty || !ts.isPropertyAssignment(excludeProperty)) return undefined;
    if (!ts.isArrayLiteralExpression(excludeProperty.initializer)) return undefined;

    return excludeProperty.initializer.elements.filter(ts.isStringLiteral).map(entry => entry.text);
  }

  return ts.forEachChild(node, findTestExcludeEntries);
}

describe('Vitest config', () => {
  it('does not exclude test files from the shared test run', () => {
    const excludeEntries = findTestExcludeEntries(sourceFile);

    expect(excludeEntries, 'Expected vitest.config.ts to define test.exclude').toBeDefined();

    const testFileExcludes = excludeEntries?.filter(entry => entry.includes('.test.'));
    expect(testFileExcludes).toEqual([]);
  });

  it('does not discover feedback test copies under .tmp', () => {
    const excludeEntries = findTestExcludeEntries(sourceFile);

    expect(excludeEntries).toContain('**/.tmp/**');

    const copiedTestDirectory = resolve(process.cwd(), '.tmp/vitest-config-feedback-copy');
    const copiedTest = resolve(copiedTestDirectory, 'feedback-email-service.test.ts');
    mkdirSync(copiedTestDirectory, { recursive: true });
    writeFileSync(
      copiedTest,
      "import { it } from 'vitest';\nit('copied feedback test', () => {});\n"
    );

    try {
      const result = spawnSync(
        process.execPath,
        [
          resolve(process.cwd(), 'node_modules/vitest/vitest.mjs'),
          'list',
          '--filesOnly',
          copiedTest,
        ],
        { cwd: process.cwd(), encoding: 'utf8' }
      );

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).not.toContain('feedback-email-service.test.ts');
    } finally {
      unlinkSync(copiedTest);
      rmdirSync(copiedTestDirectory);
    }
  });
});
