import { SourceMap } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

import { createSymbolicationSmokeError } from '../../test/fixtures/symbolication-smoke.mjs';

describe('offline symbolication fixture', () => {
  it.each(['production', 'preview', 'other'])('refuses %s', environment => {
    expect(() => createSymbolicationSmokeError({ environment, ci: false })).toThrow(
      'Smoke fixture requires local manual execution'
    );
  });

  it('refuses capture-like execution in CI', () => {
    expect(() => createSymbolicationSmokeError({ environment: 'local', ci: true })).toThrow(
      'Smoke fixture requires local manual execution'
    );
  });

  it('maps a minified synthetic stack to the original throw without ingestion', async () => {
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: 'esbuild',
        sourcemap: 'hidden',
        lib: {
          entry: path.resolve('test/fixtures/symbolication-smoke.mjs'),
          formats: ['cjs'],
          fileName: 'symbolication-smoke',
        },
      },
    });
    const output = Array.isArray(result) ? result[0] : result;
    const chunk = output.output.find(item => item.type === 'chunk');
    const sandbox = { exports: {}, process: { env: {} } };
    vm.runInNewContext(chunk.code, sandbox, { filename: 'symbolication-smoke.cjs' });
    // Read generated V8 positions before Vitest's own stack formatter remaps them.
    vm.runInNewContext('Error.prepareStackTrace = (_error, frames) => frames', sandbox);
    const error = sandbox.exports.createSymbolicationSmokeError({
      environment: 'local',
      ci: false,
    });
    expect(error.message).toBe('OG offline symbolication smoke');
    const frame = error.stack.find(frame => frame.getFileName() === 'symbolication-smoke.cjs');
    expect(frame).toBeDefined();
    const entry = new SourceMap(JSON.parse(chunk.map.toString())).findEntry(
      frame.getLineNumber() - 1,
      frame.getColumnNumber() - 1
    );
    expect(entry.originalSource).toContain('symbolication-smoke.mjs');
    const source = chunk.map.sourcesContent[0].split('\n');
    expect(source[entry.originalLine]).toContain("new Error('OG offline symbolication smoke')");
    expect(chunk.code).not.toContain('sourceMappingURL');
  });
});
