#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schemaPath = 'docs/pocketbase/collections.schema.json';
const modelCollections = {
  UserRecord: 'users',
  DiamondProjectRecord: 'projects',
  ColoringBookRecord: 'coloring_books',
  ColoringPageRecord: 'coloring_pages',
  DiamondProgressNoteRecord: 'progress_notes',
  ColoringProgressNoteRecord: 'coloring_page_progress_notes',
  TagRecord: 'tags',
};
const labels = {
  'no-app-pr-needed': 'No app PR needed',
  'app-pr-recommended': 'App PR recommended',
  'app-pr-required': 'App PR required',
  'needs-investigation': 'Needs investigation',
};
const digest = input => createHash('sha256').update(input).digest('hex');

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30 * 1000,
    killSignal: 'SIGKILL',
  });
  if (result.error || result.status !== 0) throw new Error('Git evidence unavailable.');
  return result.stdout;
}

export function parseNativeSyncArgs(argv, env = process.env) {
  const options = {
    root: rootDir,
    base: env.VALIDATION_BASE_REF || 'origin/dev',
    nativeRoot: env.NATIVE_APP_REPO,
    verifyNative: env.NATIVE_SYNC_VERIFY === '1',
    simulator: env.NATIVE_SYNC_SIMULATOR_ID,
  };
  for (const arg of argv) {
    if (arg.startsWith('--base=')) options.base = arg.slice(7);
    else if (arg.startsWith('--native=')) options.nativeRoot = arg.slice(9);
    else if (arg.startsWith('--output=')) options.output = arg.slice(9);
    else if (arg.startsWith('--simulator=')) options.simulator = arg.slice(12);
    else if (arg === '--verify-native') options.verifyNative = true;
    else throw new Error('Unknown native sync argument. See docs/native-sync-report.md.');
  }
  if (!options.base || options.base.startsWith('-'))
    throw new Error('Supply a valid --base=<git-ref>.');
  return options;
}

function findNativeRoot(root) {
  const commonDir = path.resolve(root, git(root, ['rev-parse', '--git-common-dir']).trim());
  return path.join(path.dirname(path.dirname(commonDir)), 'organized-glitter-app');
}

function sourceFiles(root) {
  const paths = git(root, [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    'ios/OrganizedGlitter',
  ])
    .split('\0')
    .filter(file => file.endsWith('.swift'));
  return paths
    .filter(file => existsSync(path.join(root, file)))
    .map(file => ({ path: file, text: readFileSync(path.join(root, file), 'utf8') }));
}

function backendSourceDigest(root) {
  const files = git(root, [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    'pb_hooks',
    'pb_migrations',
    schemaPath,
  ])
    .split('\0')
    .filter(file => file.endsWith('.js') || file === schemaPath)
    .sort();
  return digest(
    files
      .map(
        file =>
          `${file}\0${existsSync(path.join(root, file)) ? digest(readFileSync(path.join(root, file))) : 'deleted'}`
      )
      .join('\0')
  );
}

function blockAt(text, offset) {
  const start = text.indexOf('{', offset);
  if (start < 0) return null;
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    if (text[index] === '{') depth++;
    if (text[index] === '}' && --depth === 0)
      return { text: text.slice(start + 1, index), start: start + 1 };
  }
  return null;
}

function nativeFields(files) {
  const fields = new Map();
  for (const [model, collection] of Object.entries(modelCollections)) {
    for (const file of files) {
      const match = new RegExp(`\\bstruct\\s+${model}\\b`).exec(file.text);
      if (!match) continue;
      const block = blockAt(file.text, match.index);
      if (!block) continue;
      const properties = [...block.text.matchAll(/\b(?:let|var)\s+(\w+)\s*:\s*([^\n={]+)/g)];
      const codingKeys = new Map(
        [...block.text.matchAll(/\bcase\s+(\w+)\s*=\s*"([^"]+)"/g)].map(m => [m[1], m[2]])
      );
      fields.set(
        collection,
        properties.map(property => ({
          name: codingKeys.get(property[1]) || property[1],
          optional: property[2].trim().endsWith('?'),
          path: file.path,
          line: file.text.slice(0, block.start + property.index).split('\n').length,
        }))
      );
    }
  }
  return fields;
}

function references(files, terms) {
  return files
    .flatMap(file =>
      file.text
        .split('\n')
        .flatMap((line, index) =>
          terms.some(term => line.includes(term)) ? [{ path: file.path, line: index + 1 }] : []
        )
    )
    .slice(0, 12);
}

const meaningfulKeys = (before, after, ignored) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    key => !ignored.includes(key)
  );
const changedKeys = (before, after, keys) =>
  keys.filter(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));

export function assessChanges({ paths, before, after, nativeFiles }) {
  const findings = [];
  const dependencies = nativeFields(nativeFiles);
  const add = (severity, kind, message, extra = {}) =>
    findings.push({ severity, kind, message, ...extra });
  const oldCollections = new Map(before.map(collection => [collection.name, collection]));
  const newCollections = new Map(after.map(collection => [collection.name, collection]));
  for (const [name, oldCollection] of oldCollections) {
    const collection = newCollections.get(name);
    const fields = dependencies.get(name) || [];
    const native = fields.map(({ path, line }) => ({ path, line })).slice(0, 3);
    if (!collection) {
      add(
        fields.length ? 'required' : 'investigate',
        'collection-removed',
        `Collection ${name} was removed. Restore compatibility or update native callers.`,
        { collection: name, web: schemaPath, native }
      );
      continue;
    }
    const rules = changedKeys(
      oldCollection,
      collection,
      meaningfulKeys(oldCollection, collection, [
        'id',
        'name',
        'fields',
        'created',
        'updated',
        'system',
      ])
    );
    if (rules.length)
      add(
        'investigate',
        'collection-behavior',
        `Review ${name} authorization/authentication changes: ${rules.join(', ')}.`,
        { collection: name, web: schemaPath, native }
      );
    const previousFields = new Map((oldCollection.fields || []).map(field => [field.name, field]));
    const currentFields = new Map((collection.fields || []).map(field => [field.name, field]));
    for (const [fieldName, oldField] of previousFields) {
      const field = currentFields.get(fieldName);
      const matchingFields = fields.filter(f => f.name === fieldName);
      const used = matchingFields.map(({ path, line }) => ({ path, line }));
      if (!field)
        add(
          matchingFields.some(field => !field.optional)
            ? 'required'
            : used.length
              ? 'recommended'
              : 'investigate',
          'field-removed',
          `${name}.${fieldName} was removed. ${used.length ? 'The native model still decodes this key. Restore compatibility or update its model and callers.' : 'Check native writes and indirect consumers before deciding.'}`,
          { collection: name, field: fieldName, web: schemaPath, native: used }
        );
      else if (oldField.type !== field.type)
        add(
          used.length ? 'required' : 'investigate',
          'field-type',
          `${name}.${fieldName} changed type from ${oldField.type} to ${field.type}. Review native decoding and writes.`,
          { collection: name, field: fieldName, web: schemaPath, native: used }
        );
      else {
        const constraints = changedKeys(
          oldField,
          field,
          meaningfulKeys(oldField, field, ['id', 'name', 'type', 'help', 'presentable', 'system'])
        );
        if (constraints.length)
          add(
            'investigate',
            'field-constraints',
            `Review ${name}.${fieldName} constraints: ${constraints.join(', ')}.`,
            { collection: name, field: fieldName, web: schemaPath, native: used }
          );
      }
    }
    for (const [fieldName, field] of currentFields) {
      if (!previousFields.has(fieldName))
        add(
          field.required ? 'investigate' : 'recommended',
          'field-added',
          `${name}.${fieldName} was added. Review native create/write requirements and whether models, forms, and sync should expose it.`,
          { collection: name, field: fieldName, web: schemaPath, native }
        );
    }
  }
  for (const [name] of newCollections) {
    if (!oldCollections.has(name))
      add(
        'recommended',
        'collection-added',
        `Collection ${name} was added. Review whether its feature needs a native equivalent.`,
        { collection: name, web: schemaPath, native: [] }
      );
  }
  for (const file of paths) {
    if (file === schemaPath) continue;
    if (
      /^(pb_hooks|pb_migrations)\//.test(file) ||
      /^docs\/(mobile|pocketbase)\//.test(file) ||
      file === 'scripts/install-pocketbase.mjs'
    ) {
      const terms = /mobile.*sync/.test(file)
        ? ['/api/mobile/sync', 'snapshot.version']
        : /auth|apple|oauth/.test(file)
          ? ['signIn', 'OAuth', 'register']
          : ['collection:', 'collectionName:'];
      add(
        'investigate',
        'backend-behavior',
        'Review endpoint, ownership, validation, and retry behavior against native callers. A schema comparison cannot verify this change.',
        { web: file, native: references(nativeFiles, terms) }
      );
    } else if (
      /^src\/(components|features|pages|hooks|services|contexts|lib|utils)\/.*\.(tsx?|jsx?)$/.test(
        file
      ) &&
      !/(__tests__|\.test\.|\.spec\.)/.test(file)
    ) {
      const terms = file.toLowerCase().includes('coloring')
        ? ['Coloring', 'coloring_']
        : file.toLowerCase().includes('diamond')
          ? ['Diamond', 'projects']
          : file.toLowerCase().includes('auth')
            ? ['signIn', 'OAuth']
            : ['LibrarySession'];
      add(
        'recommended',
        'feature-parity',
        'Review the changed user behavior. If it is shared with native, describe the companion app change; web-only fixes need no app PR.',
        { web: file, native: references(nativeFiles, terms) }
      );
    } else if (
      !/\.(md|css|scss|svg|png|jpe?g|webp|ico|woff2?|ttf)$/.test(file) &&
      !/^(scripts\/|e2e\/|test\/|\.github\/|blog\/|snippets\/|public\/)/.test(file) &&
      !/^(AGENTS\.md|LICENSE|NOTICE|\.gitignore|\.prettier|\.husky\/)/.test(file)
    ) {
      add(
        'investigate',
        'unclassified',
        'Review this configuration or unclassified change for effects on the shared native contract.',
        { web: file, native: [] }
      );
    }
  }
  const outcome = findings.some(f => f.severity === 'required')
    ? 'app-pr-required'
    : findings.some(f => f.severity === 'investigate')
      ? 'needs-investigation'
      : findings.length
        ? 'app-pr-recommended'
        : 'no-app-pr-needed';
  return { outcome, findings };
}

export async function createNativeSyncReport({
  root = rootDir,
  base = 'origin/dev',
  nativeRoot,
  verifyNative = false,
  simulator,
  output,
} = {}) {
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    outcome: 'needs-investigation',
    web: { baseRef: base },
    native: null,
    changedPaths: [],
    findings: [],
    integration: {
      outcome: 'not-run',
      reason:
        'Native runtime compatibility is unverified. Use --verify-native with an iOS 26 simulator.',
    },
    limitations: [
      'Source findings are advisory. Feature parity needs a human review of changed behavior.',
      'Only the selected local native checkout is assessed. This is not a supported-release matrix or deployed-environment check.',
      'Schema breaks may also be fixed in the backend; an app PR is not always the right remedy.',
    ],
  };
  try {
    const baseSha = git(root, ['rev-parse', '--verify', `${base}^{commit}`]).trim();
    const mergeBase = git(root, ['merge-base', baseSha, 'HEAD']).trim();
    const dirtyStatus = git(root, ['status', '--porcelain=v1', '-z']);
    report.web = {
      baseRef: base,
      baseSha,
      mergeBase,
      commit: git(root, ['rev-parse', 'HEAD']).trim(),
      dirty: dirtyStatus.length > 0,
    };
    const changed = git(root, ['diff', '--name-only', '-z', '--no-renames', mergeBase, '--']);
    const staged = git(root, [
      'diff',
      '--cached',
      '--name-only',
      '-z',
      '--no-renames',
      mergeBase,
      '--',
    ]);
    const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
    report.changedPaths = [
      ...new Set(
        [...changed.split('\0'), ...staged.split('\0'), ...untracked.split('\0')].filter(Boolean)
      ),
    ].sort();
    report.web.diffSha256 = digest(
      git(root, ['diff', '--binary', '--no-ext-diff', mergeBase, '--'])
    );
    nativeRoot = path.resolve(nativeRoot || findNativeRoot(root));
    const nativeFiles = sourceFiles(nativeRoot);
    if (!nativeFiles.length) throw new Error('Native Swift source unavailable.');
    report.native = {
      commit: git(nativeRoot, ['rev-parse', 'HEAD']).trim(),
      dirty: git(nativeRoot, ['status', '--porcelain=v1', '-z']).length > 0,
      sourceSha256: digest(nativeFiles.map(file => `${file.path}\0${file.text}`).join('\0')),
      contract: JSON.parse(readFileSync(path.join(nativeRoot, 'ios/BackendContract.json'), 'utf8')),
    };
    const before = JSON.parse(git(root, ['show', `${mergeBase}:${schemaPath}`]));
    const after = JSON.parse(readFileSync(path.join(root, schemaPath), 'utf8'));
    if (!Array.isArray(before) || !Array.isArray(after))
      throw new Error('Schema comparison unavailable.');
    report.web.backendSourceSha256 = backendSourceDigest(root);
    const assessment = assessChanges({ paths: report.changedPaths, before, after, nativeFiles });
    Object.assign(report, assessment);
    const schemaUnstaged = git(root, ['diff', '--name-only', '--', schemaPath]).trim();
    const schemaStaged = git(root, ['diff', '--cached', '--name-only', '--', schemaPath]).trim();
    if (schemaUnstaged && schemaStaged) {
      report.findings.push({
        severity: 'investigate',
        kind: 'staged-schema',
        message:
          'The schema has both staged and unstaged changes. Source assessment uses the working tree; review the staged candidate separately before committing.',
        web: schemaPath,
        native: [],
      });
      if (report.outcome !== 'app-pr-required') report.outcome = 'needs-investigation';
    }
    report.web.schemaSha256 = digest(readFileSync(path.join(root, schemaPath)));
    if (verifyNative) {
      const { verifyNativeIntegration } = await import('./verify-native-integration.mjs');
      report.integration = await verifyNativeIntegration({ root, nativeRoot, simulator, output });
      const nativeAfter = sourceFiles(nativeRoot);
      if (
        backendSourceDigest(root) !== report.web.backendSourceSha256 ||
        git(nativeRoot, ['rev-parse', 'HEAD']).trim() !== report.native.commit ||
        (report.integration.nativeCommit &&
          report.integration.nativeCommit !== report.native.commit) ||
        digest(nativeAfter.map(file => `${file.path}\0${file.text}`).join('\0')) !==
          report.native.sourceSha256
      ) {
        if (report.integration.outcome === 'passed') {
          report.integration.outcome = 'failed';
          report.integration.reason = 'Source inputs changed during integration. Rerun the report.';
        }
        report.findings.push({
          severity: 'investigate',
          kind: 'inputs-changed',
          message:
            'Backend or native source changed during integration. Rerun before relying on this evidence.',
          native: [],
        });
        if (report.outcome !== 'app-pr-required') report.outcome = 'needs-investigation';
      }
      if (report.integration.outcome !== 'passed' && report.outcome !== 'app-pr-required')
        report.outcome = 'needs-investigation';
    }
  } catch {
    if (report.integration.outcome === 'passed') {
      report.integration.outcome = 'failed';
      report.integration.reason =
        'Source verification could not complete after integration. Rerun the report.';
    }
    if (report.outcome !== 'app-pr-required') report.outcome = 'needs-investigation';
    report.findings.push({
      severity: 'investigate',
      kind: 'missing-evidence',
      message:
        'Could not complete the source comparison. Check the base ref, native checkout, tracked Swift source, and both schema snapshots. Compatibility remains unverified.',
      native: [],
    });
  }
  return report;
}

export function renderNativeSyncReport(report) {
  const lines = [
    '# Native app sync report',
    '',
    `Result: **${labels[report.outcome]}**`,
    '',
    `Generated: ${report.generatedAt}`,
    `Web: ${report.web.commit || 'unavailable'}; dirty: ${report.web.dirty ?? 'unknown'}`,
    `Target: ${report.web.baseRef}; target commit: ${report.web.baseSha || 'unavailable'}; merge base: ${report.web.mergeBase || 'unavailable'}`,
    `Native: ${report.native?.commit || 'unavailable'}; dirty: ${report.native?.dirty ?? 'unknown'}`,
    `Backend source SHA-256: ${report.web.backendSourceSha256 || 'unavailable'}`,
    `Native source SHA-256: ${report.native?.sourceSha256 || 'unavailable'}`,
    '',
    `Integration: ${report.integration.outcome}. ${report.integration.reason || ''}`,
    ...(report.integration.resultBundle
      ? [`Result bundle: ${report.integration.resultBundle}`]
      : []),
    '',
    '## Findings',
    '',
  ];
  for (const finding of report.findings) {
    lines.push(`- ${finding.message}`, `  Web: ${finding.web || 'comparison inputs'}.`);
    if (finding.native?.length)
      lines.push(`  Native: ${finding.native.map(ref => `${ref.path}:${ref.line}`).join(', ')}.`);
  }
  if (!report.findings.length)
    lines.push(
      'No shared contract or feature changes were identified by the source checks. Runtime compatibility remains limited to the integration coverage recorded above.'
    );
  lines.push(
    '',
    '## Changed paths',
    '',
    ...report.changedPaths.map(file => `- ${file}`),
    '',
    '## Review before opening an app PR',
    '',
    '- Confirm whether each changed behavior belongs in the native app.',
    '- Trace native reads, writes, decoding, offline edits, and retry behavior at the referenced locations.',
    '- For each needed app change, record the affected model or screen, expected behavior, and validation.',
    '- Keep backward compatibility for supported installed app releases.',
    '',
    '## Limitations',
    '',
    ...report.limitations.map(item => `- ${item}`),
    ''
  );
  return lines.join('\n');
}

export async function runNativeSyncReport(options) {
  if (process.env.CI) {
    process.stdout.write('Native sync report skipped in CI; this command is local-only.\n');
    return null;
  }
  const output = path.resolve(
    options.output ||
      path.join(
        options.root || rootDir,
        '.tmp/native-sync',
        `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
      )
  );
  mkdirSync(output, { recursive: true });
  const report = await createNativeSyncReport({ ...options, output });
  writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(output, 'report.md'), renderNativeSyncReport(report));
  process.stdout.write(
    `Native sync: ${labels[report.outcome]}\nReport: ${path.join(output, 'report.md')}\n`
  );
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    await runNativeSyncReport(parseNativeSyncArgs(process.argv.slice(2)));
  } catch {
    process.stderr.write(
      'Native sync report unavailable. Compatibility remains unverified; web validation can continue.\n'
    );
  }
}
