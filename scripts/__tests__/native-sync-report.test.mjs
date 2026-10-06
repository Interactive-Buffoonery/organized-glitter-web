// @vitest-environment node
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  symlinkSync,
  existsSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runAdvisoryNativeReport } from '../run-local-validation.mjs';
import {
  createNativeSyncReport,
  assessChanges,
  parseNativeSyncArgs,
} from '../native-sync-report.mjs';

const schema = fields => [{ name: 'projects', type: 'base', fields }];
const nativeFiles = [
  {
    path: 'ios/OrganizedGlitter/Networking/PocketBaseRecords.swift',
    text: 'struct DiamondProjectRecord: Codable {\n let title: String\n let kitCategory: String\n enum CodingKeys: String, CodingKey {\n case title\n case kitCategory = "kit_category"\n }\n}',
  },
];
const field = (name, extra = {}) => ({ name, type: 'text', ...extra });
const assess = extra =>
  assessChanges({
    paths: [],
    before: schema([field('title'), field('kit_category')]),
    after: schema([field('title'), field('kit_category')]),
    nativeFiles,
    ...extra,
  });

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'og-native-report-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.test');
  mkdirSync(path.join(root, 'docs/pocketbase'), { recursive: true });
  writeFileSync(
    path.join(root, 'docs/pocketbase/collections.schema.json'),
    JSON.stringify(schema([field('title')]))
  );
  writeFileSync(path.join(root, '.gitignore'), '.tmp/\n.env*\n');
  git('add', '.');
  git('commit', '-qm', 'add baseline');
  return { root, git, base: git('rev-parse', 'HEAD') };
}

function nativeFixture() {
  const { root, git } = fixture();
  mkdirSync(path.join(root, 'ios/OrganizedGlitter/Networking'), { recursive: true });
  writeFileSync(path.join(root, nativeFiles[0].path), nativeFiles[0].text);
  writeFileSync(
    path.join(root, 'ios/BackendContract.json'),
    JSON.stringify({
      backendRepository: 'example/web',
      backendCommit: 'a'.repeat(40),
      pocketBaseVersion: '0.40.4',
      schemaSha256: 'b'.repeat(64),
    })
  );
  git('add', 'ios');
  git('commit', '-qm', 'add native client');
  return root;
}

describe('native sync decision', () => {
  it('does not recommend an app PR for documentation or CSS alone', () => {
    expect(assess({ paths: ['README.md', 'src/index.css'] }).outcome).toBe('no-app-pr-needed');
  });

  it('requires an app update when a decoded field or collection disappears', () => {
    const result = assess({ after: schema([field('kit_category')]) });
    expect(result.outcome).toBe('app-pr-required');
    expect(result.findings[0]).toMatchObject({
      collection: 'projects',
      field: 'title',
      native: [{ path: nativeFiles[0].path, line: 2 }],
    });
    expect(assess({ after: [] }).outcome).toBe('app-pr-required');
  });

  it('flags changed field types without treating schema hash changes as failures', () => {
    expect(
      assess({ after: schema([field('title', { type: 'number' }), field('kit_category')]) }).outcome
    ).toBe('app-pr-required');
    expect(
      assess({
        after: schema([field('title'), field('kit_category'), field('new_optional_field')]),
      }).outcome
    ).toBe('app-pr-recommended');
  });

  it('requires investigation for rules and field constraints', () => {
    const after = schema([field('title', { required: true }), field('kit_category')]);
    after[0].updateRule = 'false';
    const result = assess({ after });
    expect(result.outcome).toBe('needs-investigation');
    expect(result.findings.map(f => f.kind)).toEqual(
      expect.arrayContaining(['field-constraints', 'collection-behavior'])
    );
  });

  it('does not claim optional missing fields break decoding', () => {
    const files = [
      {
        ...nativeFiles[0],
        text: nativeFiles[0].text.replace('let title: String', 'let title: String?'),
      },
    ];
    expect(assess({ nativeFiles: files, after: schema([field('kit_category')]) }).outcome).toBe(
      'app-pr-recommended'
    );
  });

  it('investigates new required fields and new schema configuration keys', () => {
    expect(
      assess({
        after: schema([
          field('title'),
          field('kit_category'),
          field('new_required', { required: true }),
        ]),
      }).outcome
    ).toBe('needs-investigation');
    expect(
      assess({
        after: [
          { ...schema([field('title'), field('kit_category')])[0], authToken: { duration: 1 } },
        ],
      }).outcome
    ).toBe('needs-investigation');
    expect(
      assess({ after: schema([field('title', { newConstraint: true }), field('kit_category')]) })
        .outcome
    ).toBe('needs-investigation');
  });

  it('does not omit a staged change when the working file matches the base', async () => {
    const { root, git, base } = fixture();
    writeFileSync(
      path.join(root, 'docs/pocketbase/collections.schema.json'),
      JSON.stringify(schema([]))
    );
    git('add', '.');
    writeFileSync(
      path.join(root, 'docs/pocketbase/collections.schema.json'),
      JSON.stringify(schema([field('title')]))
    );
    const report = await createNativeSyncReport({ root, base, nativeRoot: nativeFixture() });
    expect(report.changedPaths).toContain('docs/pocketbase/collections.schema.json');
    expect(report.outcome).toBe('needs-investigation');
    expect(report.findings.some(f => f.kind === 'staged-schema')).toBe(true);
  });

  it('does not mistake a same-named field in an unrelated collection for a native dependency', () => {
    const before = [
      ...schema([field('title'), field('kit_category')]),
      { name: 'web_only', fields: [field('title')] },
    ];
    const after = [
      ...schema([field('title'), field('kit_category')]),
      { name: 'web_only', fields: [] },
    ];
    expect(assess({ before, after }).outcome).not.toBe('app-pr-required');
  });

  it('marks hook and migration changes as unverified even if schema is unchanged', () => {
    expect(assess({ paths: ['pb_hooks/mobile_sync.pb.js'] }).outcome).toBe('needs-investigation');
    expect(assess({ paths: ['pb_migrations/123_change.js'] }).outcome).toBe('needs-investigation');
  });

  it('asks for a parity review when shared web feature code changes', () => {
    expect(assess({ paths: ['src/components/coloring/BookEditor.tsx'] }).outcome).toBe(
      'app-pr-recommended'
    );
    expect(assess({ paths: ['src/hooks/mutations/coloring/useUpdateBook.ts'] }).outcome).toBe(
      'app-pr-recommended'
    );
  });

  it('does not hide unknown configuration or source paths behind a clean verdict', () => {
    expect(assess({ paths: ['package.json'] }).outcome).toBe('needs-investigation');
    expect(assess({ paths: ['src/new-library-helper.ts'] }).outcome).toBe('needs-investigation');
  });
});

describe('local report command', () => {
  it('keeps a required app change when integration observes changed inputs', async () => {
    const { root, base } = fixture();
    const nativeRoot = nativeFixture();
    writeFileSync(
      path.join(root, 'docs/pocketbase/collections.schema.json'),
      JSON.stringify(schema([]))
    );
    const integration = await import('../verify-native-integration.mjs');
    const spy = vi.spyOn(integration, 'verifyNativeIntegration').mockImplementation(async () => {
      writeFileSync(
        path.join(nativeRoot, nativeFiles[0].path),
        `${nativeFiles[0].text}\nstruct Changed {}`
      );
      return { outcome: 'passed' };
    });
    try {
      const report = await createNativeSyncReport({ root, base, nativeRoot, verifyNative: true });
      expect(report.outcome).toBe('app-pr-required');
      expect(report.findings).toContainEqual(expect.objectContaining({ kind: 'inputs-changed' }));
      expect(report.integration.outcome).toBe('failed');
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects passed integration when source verification becomes unavailable', async () => {
    const { root, base } = fixture();
    const nativeRoot = nativeFixture();
    writeFileSync(
      path.join(root, 'docs/pocketbase/collections.schema.json'),
      JSON.stringify(schema([]))
    );
    const movedRoot = `${nativeRoot}-moved`;
    const integration = await import('../verify-native-integration.mjs');
    const spy = vi.spyOn(integration, 'verifyNativeIntegration').mockImplementation(async () => {
      renameSync(nativeRoot, movedRoot);
      return { outcome: 'passed' };
    });
    try {
      const report = await createNativeSyncReport({ root, base, nativeRoot, verifyNative: true });
      expect(report.outcome).toBe('app-pr-required');
      expect(report.integration.outcome).toBe('failed');
      expect(report.findings).toContainEqual(expect.objectContaining({ kind: 'missing-evidence' }));
    } finally {
      renameSync(movedRoot, nativeRoot);
      spy.mockRestore();
    }
  });

  it('rejects integration evidence from a different committed native revision', async () => {
    const { root, base } = fixture();
    const nativeRoot = nativeFixture();
    const integration = await import('../verify-native-integration.mjs');
    const spy = vi.spyOn(integration, 'verifyNativeIntegration').mockImplementation(async () => {
      execFileSync('git', ['commit', '--allow-empty', '-qm', 'advance native revision'], {
        cwd: nativeRoot,
      });
      return { outcome: 'passed' };
    });
    try {
      const report = await createNativeSyncReport({ root, base, nativeRoot, verifyNative: true });
      expect(report.outcome).toBe('needs-investigation');
      expect(report.integration.outcome).toBe('failed');
      expect(report.findings).toContainEqual(expect.objectContaining({ kind: 'inputs-changed' }));
    } finally {
      spy.mockRestore();
    }
  });

  it('writes a report when the CLI is invoked through a symlink', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'og-native-report-link-'));
    const link = path.join(directory, 'native-sync.mjs');
    symlinkSync(new URL('../native-sync-report.mjs', import.meta.url).pathname, link);
    const output = path.join(directory, 'report');
    execFileSync(
      process.execPath,
      [link, '--base=HEAD', '--native=/missing-native-repo', `--output=${output}`],
      {
        env: { ...process.env, CI: '' },
      }
    );
    expect(existsSync(path.join(output, 'report.json'))).toBe(true);
  });
  it('defaults to dev and accepts an explicit release target and native checkout', () => {
    expect(parseNativeSyncArgs([], {})).toMatchObject({ base: 'origin/dev', verifyNative: false });
    expect(
      parseNativeSyncArgs(
        ['--base=origin/main', '--native=/example/app', '--verify-native', '--simulator=example'],
        {}
      )
    ).toMatchObject({
      base: 'origin/main',
      nativeRoot: '/example/app',
      verifyNative: true,
      simulator: 'example',
    });
    expect(() => parseNativeSyncArgs(['--unexpected'], {})).toThrow();
  });

  it('includes committed, staged, unstaged, untracked, and deleted changes without storing their contents', async () => {
    const { root, git, base } = fixture();
    mkdirSync(path.join(root, 'src/components'), { recursive: true });
    writeFileSync(
      path.join(root, 'src/components/Committed.tsx'),
      'export const title = "private-content-example";'
    );
    git('add', 'src');
    git('commit', '-qm', 'add feature');
    writeFileSync(path.join(root, 'src/components/Staged.tsx'), 'staged');
    git('add', 'src');
    writeFileSync(path.join(root, 'src/components/Untracked.tsx'), 'untracked');
    writeFileSync(path.join(root, '.env.local'), 'PASSWORD=never-read-me');
    writeFileSync(path.join(root, 'src/components/Committed.tsx'), 'unstaged');
    git('rm', 'docs/pocketbase/collections.schema.json');
    const report = await createNativeSyncReport({ root, base, nativeRoot: nativeFixture() });
    expect(report.changedPaths).toEqual(
      expect.arrayContaining([
        'src/components/Committed.tsx',
        'src/components/Staged.tsx',
        'src/components/Untracked.tsx',
        'docs/pocketbase/collections.schema.json',
      ])
    );
    expect(report.web.dirty).toBe(true);
    expect(report.outcome).toBe('needs-investigation');
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('private-content-example');
    expect(serialized).not.toContain('never-read-me');
    expect(serialized).not.toContain('PASSWORD');
  });

  it('reports a missing native repo and unavailable base without failing the web gate', async () => {
    const { root, base } = fixture();
    expect(
      (await createNativeSyncReport({ root, base, nativeRoot: '/nonexistent-native-repo' })).outcome
    ).toBe('needs-investigation');
    expect(
      (
        await createNativeSyncReport({
          root,
          base: 'unavailable-base',
          nativeRoot: nativeFixture(),
        })
      ).outcome
    ).toBe('needs-investigation');
  });

  it('uses the merge base so target-branch changes do not look like app regressions', async () => {
    const { root, git, base } = fixture();
    git('checkout', '-qb', 'feature');
    writeFileSync(path.join(root, 'README.md'), 'feature docs');
    git('add', '.');
    git('commit', '-qm', 'add docs');
    git('checkout', '-qb', 'target', base);
    writeFileSync(path.join(root, 'target-only.md'), 'target docs');
    git('add', '.');
    git('commit', '-qm', 'update target');
    git('checkout', '-q', 'feature');
    const report = await createNativeSyncReport({
      root,
      base: 'target',
      nativeRoot: nativeFixture(),
    });
    expect(report.web.mergeBase).toBe(base);
    expect(report.changedPaths).toEqual(['README.md']);
  });

  it('labels dirty native code and includes its current source evidence', async () => {
    const { root, base } = fixture();
    const nativeRoot = nativeFixture();
    writeFileSync(
      path.join(nativeRoot, nativeFiles[0].path),
      nativeFiles[0].text.replace('let title: String', 'let title: Int')
    );
    const report = await createNativeSyncReport({ root, base, nativeRoot });
    expect(report.native.dirty).toBe(true);
    expect(report.native.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.integration.outcome).toBe('not-run');
  });

  it('skips CI without launching the report and keeps launch failures advisory', () => {
    const launch = vi.fn(() => {
      throw new Error('secret-bearing subprocess error');
    });
    expect(
      runAdvisoryNativeReport('origin/dev', '/tmp/report', launch, { CI: 'true' }).outcome
    ).toBe('skipped');
    expect(launch).not.toHaveBeenCalled();
    expect(runAdvisoryNativeReport('origin/dev', '/tmp/report', launch, {}).outcome).toBe(
      'unavailable'
    );
    expect(launch).toHaveBeenCalledOnce();
  });
});
