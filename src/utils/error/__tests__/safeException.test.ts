import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeException } from '@/utils/error/safeException';
import { BUILD_GRAPH_ID, installBuildGraph, removeBuildGraph } from '@/test-utils/buildGraph';

const asset = () => `${window.location.origin}/assets/main-AbCd1234.js`;

describe('safeException', () => {
  beforeEach(() => {
    installBuildGraph();
  });

  afterEach(removeBuildGraph);

  it('retains exact build-listed lazy chunks in Safari and V8 stacks', () => {
    const path = '/assets/ProjectDetail-LongerBuildHash123.js';
    const error = new Error('private prose');
    Object.defineProperty(error, 'stack', {
      value: `Error: private prose
privateFunction@${window.location.origin}${path}?token=synthetic-token#private:12:34
    at privateFunction (${window.location.origin}${path}:56:78)
    at ${window.location.origin}/assets/ProjectDetail-Unlisted123.js:1:2`,
    });
    expect(safeException(error).error.stack).toBe(
      `Error: Application error (message redacted)\n    at ${window.location.origin}${path}:12:34\n    at ${window.location.origin}${path}:56:78`
    );
  });

  it('fails closed without a valid build graph, including formerly allowed filenames', () => {
    const manifest = document.getElementById(BUILD_GRAPH_ID)!;
    const error = new Error('private prose');
    Object.defineProperty(error, 'stack', { value: `Error: private prose\n    at ${asset()}:1:2` });
    for (const value of [
      '',
      '{',
      'null',
      '[]',
      '{"graphs":[]}',
      '{"graphs":null}',
      'x'.repeat(524289),
    ]) {
      manifest.textContent = value;
      expect(safeException(error).error.stack).toBe('Error: Application error (message redacted)');
    }
    manifest.remove();
    expect(safeException(error).properties).toMatchObject({
      exception_stack_status: 'missing_build_graph',
    });
    expect(safeException(error).error.stack).toBe('Error: Application error (message redacted)');
  });

  it.each([
    null,
    {},
    'private prose',
    [null],
    ['/src/private-photo.js'],
    Array(257).fill('/assets/main-AbCd1234.js'),
  ])('rejects malformed graph dependencies (%j)', dependencies => {
    document.getElementById(BUILD_GRAPH_ID)!.textContent = JSON.stringify({
      graphs: { '/assets/main-AbCd1234.js': dependencies },
    });
    const error = new Error('private prose');
    Object.defineProperty(error, 'stack', { value: `Error: private prose\n    at ${asset()}:1:2` });
    expect(safeException(error).properties).toEqual({
      exception_stack_status: 'missing_build_graph',
    });
    expect(safeException(error).error.stack).toBe('Error: Application error (message redacted)');
  });

  it('reports bounded reasons without copying rejected stack text', () => {
    const error = new Error('private prose');
    Object.defineProperty(error, 'stack', { value: '', configurable: true });
    expect(safeException(error).properties).toEqual({ exception_stack_status: 'missing_stack' });
    Object.defineProperty(error, 'stack', { value: 'private prose', configurable: true });
    expect(safeException(error).properties).toEqual({
      exception_stack_status: 'no_matching_frames',
    });
    document.getElementById(BUILD_GRAPH_ID)!.textContent = JSON.stringify({
      graphs: Object.fromEntries(
        Array.from({ length: 257 }, (_, i) => [`/assets/chunk-${i}.js`, []])
      ),
    });
    expect(safeException(error).properties).toEqual({
      exception_stack_status: 'missing_build_graph',
    });
  });

  it('does not accept source files, URLs or tokens as build graph keys', () => {
    document.getElementById(BUILD_GRAPH_ID)!.textContent = JSON.stringify({
      graphs: Object.fromEntries(
        [
          '/assets/../private-photo.js',
          '/src/private-photo.js',
          '/assets/main-AbCd1234.js?token=synthetic-token',
          'https://other.test/assets/main-AbCd1234.js',
          '/assets/main-AbCd1234.js.map',
        ].map(key => [key, []])
      ),
    });
    const error = new Error('private prose');
    Object.defineProperty(error, 'stack', { value: `Error: private prose\n    at ${asset()}:1:2` });
    expect(safeException(error).error.stack).toBe('Error: Application error (message redacted)');
  });

  it('retains bounded V8 and Safari app frames without raw function names or URL tokens', () => {
    const error = new ReferenceError('private notes, filename.png, password=synthetic-password');
    Object.defineProperty(error, 'stack', {
      value: `ReferenceError: private notes
    at privateFilename.png (${asset()}?token=synthetic-token#private:12:34)
privateNotes@${asset()}:56:78
    at https://other.test/assets/main-AbCd1234.js:1:2
    at file:///Users/private-person/privateFilename.png:1:2
    at ${window.location.origin}/assets/privateFilename-AbCd1234.js:1:2
    at ${window.location.origin}/src/privateFilename.ts:1:2
    at chrome-extension://synthetic-id/privateFilename.js:1:2
    at blob:${asset()}:1:2`,
      configurable: true,
    });
    const safe = safeException(error).error;
    expect(safe.name).toBe('ReferenceError');
    expect(safeException(error).properties).toMatchObject({ exception_stack_status: 'retained' });
    expect(safe.stack).toBe(`ReferenceError: Application error (message redacted)
    at ${asset()}:12:34
    at ${asset()}:56:78`);
  });

  it('does not execute message, stack or prototype name accessors', () => {
    const getter = vi.fn(() => 'private notes');
    const error = new Error('private notes');
    Object.defineProperties(error, { message: { get: getter }, stack: { get: getter } });
    const prototype = Object.create(Error.prototype);
    Object.defineProperty(prototype, 'name', { get: getter });
    Object.setPrototypeOf(error, prototype);
    expect(safeException(error).error.stack).toBe('Error: Application error (message redacted)');
    expect(getter).not.toHaveBeenCalled();
  });

  it('never invokes a custom V8 stack formatter', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
    const formatter = vi.fn(() => 'private notes');
    Object.defineProperty(Error, 'prepareStackTrace', { value: formatter, configurable: true });
    try {
      expect(safeException(new Error('private notes')).error.stack).toBe(
        'Error: Application error (message redacted)'
      );
      expect(formatter).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(Error, 'prepareStackTrace', descriptor);
      else Reflect.deleteProperty(Error, 'prepareStackTrace');
    }
  });

  it('redacts custom names, causes and aggregate members without mutating the original', () => {
    const error = new AggregateError([new Error('private notes')], 'private notes', {
      cause: 'password=synthetic-password',
    });
    error.name = 'privateFilename.png';
    const safe = safeException(error).error;
    expect(safe.name).toBe('Error');
    expect(safe).not.toHaveProperty('cause');
    expect(safe).not.toHaveProperty('errors');
    expect(error.name).toBe('privateFilename.png');
  });
});
