const MAX_STACK_LENGTH = 16_384;
const MAX_STACK_LINES = 100;
const MAX_FRAMES = 20;
const ERROR_NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
  'ImportExportError',
]);

// Only fixed build entry/vendor names are accepted. Arbitrary filenames,
// source paths, function labels and third-party URLs are never forwarded.
const APP_ASSET =
  /^\/assets\/(?:index|react-vendor|pocketbase-vendor|analytics-vendor|form-vendor|ui-vendor)-[A-Za-z0-9_-]{8}\.js$/;

// V8 exposes stack through a shared native accessor. Never invoke a custom
// accessor or custom stack formatter, and reject accessor-based headers before
// allowing V8 to format a native stack.
const nativeStackGetter = Object.getOwnPropertyDescriptor(new Error(), 'stack')?.get;

function stackString(value: Error): string | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, 'stack');
  if (!descriptor) return undefined;
  if ('value' in descriptor)
    return typeof descriptor.value === 'string' ? descriptor.value : undefined;
  if (!nativeStackGetter || descriptor.get !== nativeStackGetter) return undefined;
  const formatter = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
  if (formatter && (!('value' in formatter) || formatter.value !== undefined)) return undefined;
  let current: object | null = value;
  for (let depth = 0; current && depth < 5; depth++) {
    for (const key of ['name', 'message', 'toString']) {
      const field = Object.getOwnPropertyDescriptor(current, key);
      if (!field) continue;
      if (!('value' in field)) return undefined;
      if (
        key === 'toString'
          ? field.value !== Error.prototype.toString && field.value !== Object.prototype.toString
          : typeof field.value !== 'string'
      )
        return undefined;
    }
    current = Object.getPrototypeOf(current);
  }
  if (current) return undefined;
  const stack: unknown = nativeStackGetter.call(value);
  return typeof stack === 'string' ? stack : undefined;
}

function ownString(value: object, key: string): string | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
    ? descriptor.value
    : undefined;
}

export function thrownValueType(value: unknown): string {
  try {
    return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  } catch {
    return 'object';
  }
}

/** A local-only bounded snapshot for classification, without running getters. */
export function inspectException(value: unknown): Error | string | undefined {
  try {
    if (typeof value === 'string') return value.slice(0, MAX_STACK_LENGTH);
    if (!(value instanceof Error)) return undefined;
    const snapshot = new Error((ownString(value, 'message') ?? '').slice(0, MAX_STACK_LENGTH));
    snapshot.stack = (stackString(value) ?? '').slice(0, MAX_STACK_LENGTH);
    let name = ownString(value, 'name');
    let prototype = Object.getPrototypeOf(value);
    for (let depth = 0; name === undefined && prototype && depth < 3; depth++) {
      name = ownString(prototype, 'name');
      prototype = Object.getPrototypeOf(prototype);
    }
    snapshot.name = name && ERROR_NAMES.has(name) ? name : 'Error';
    return snapshot;
  } catch {
    return undefined;
  }
}

function safeFrames(stack: string): string[] {
  const frames: string[] = [];
  for (const line of stack.slice(0, MAX_STACK_LENGTH).split('\n', MAX_STACK_LINES)) {
    if (!/^\s*at\s/.test(line) && !/^[^\s@]*@https?:\/\//.test(line)) continue;
    // V8 and Firefox/Safari locations; discard everything before the location.
    const location = line.match(/(?:\(|\s|@|^)(https?:\/\/[^\s()]+):(\d{1,7}):(\d{1,7})\)?$/);
    if (!location) continue;
    try {
      const url = new URL(location[1]);
      if (url.origin !== window.location.origin || url.username || url.password) continue;
      if (!APP_ASSET.test(url.pathname)) continue;
      frames.push(`    at ${url.origin}${url.pathname}:${location[2]}:${location[3]}`);
      if (frames.length === MAX_FRAMES) break;
    } catch {
      // Missing browser globals and malformed locations simply lose the frame.
    }
  }
  return frames;
}

/**
 * Build a fresh SDK input. Free text is deliberately discarded rather than
 * pattern-redacted: arbitrary private prose cannot be recognized reliably.
 * Fixed error types plus bounded app locations retain grouping information.
 */
export function safeException(value: unknown): {
  error: Error;
  properties?: Record<string, unknown>;
} {
  const inspected = inspectException(value);
  const isError = inspected instanceof Error;
  const type = thrownValueType(value);
  const name = isError ? inspected.name : 'Error';
  const message = isError
    ? name === 'ImportExportError'
      ? 'Import/export operation failed'
      : 'Application error (message redacted)'
    : `Non-Error thrown (${type})`;
  const error = new Error(message);
  error.name = name;
  // Never keep the stack generated here: it would falsely group reports at
  // the sanitizer instead of the original throw site.
  error.stack = [`${name}: ${message}`, ...(isError ? safeFrames(inspected.stack ?? '') : [])].join(
    '\n'
  );
  return { error, ...(!isError && { properties: { non_error_type: type } }) };
}
