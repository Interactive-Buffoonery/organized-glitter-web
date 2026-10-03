import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const readSource = (path: string) => readFileSync(resolvePath(path), 'utf8');
const resolvePath = (path: string) => join(process.cwd(), path);
const getReadinessUsage = (source: string) => {
  const parsed = ts.createSourceFile(
    'coverage.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const usage: string[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === '@/hooks/useAppReady' &&
      !node.importClause?.isTypeOnly &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings) &&
      node.importClause.namedBindings.elements.some(
        element =>
          !element.isTypeOnly && (element.propertyName ?? element.name).text === 'useAppReady'
      )
    ) {
      usage.push('import useAppReady');
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['useAppReady', 'useHideSplash'].includes(node.expression.text)
    ) {
      usage.push(
        `${node.expression.text}(${node.arguments.map(argument => argument.getText(parsed)).join(',')})`
      );
    }
    if (ts.isJsxAttribute(node) && node.name.getText(parsed) === 'data-app-ready') {
      usage.push('data-app-ready');
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return usage.join('\n');
};

const listSrcTsFiles = (dir: string): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      files.push(...listSrcTsFiles(fullPath));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(relative(process.cwd(), fullPath));
  }

  return files;
};

describe('route app-ready coverage', () => {
  const mountReadyPages = [
    'src/pages/ForgotPassword.tsx',
    'src/pages/ResetPassword.tsx',
    'src/pages/ConfirmPasswordReset.tsx',
    'src/pages/VerifyEmail.tsx',
    'src/pages/EmailConfirmation.tsx',
    'src/pages/ConfirmEmailChange.tsx',
    'src/pages/About.tsx',
    'src/pages/Privacy.tsx',
    'src/pages/Terms.tsx',
    'src/pages/LinksPage.tsx',
    'src/pages/NotFound.tsx',
    'src/pages/Home.tsx',
    'src/pages/Options.tsx',
    'src/pages/NewProject.tsx',
    'src/pages/NewColoringBook.tsx',
    'src/pages/ProjectDetail.tsx',
    'src/pages/EditProject.tsx',
    'src/pages/EditColoringBook.tsx',
    'src/pages/ChangePassword.tsx',
    'src/pages/ChangeEmail.tsx',
    'src/pages/DeleteAccount.tsx',
    'src/pages/CompanyList.tsx',
    'src/pages/ArtistList.tsx',
    'src/pages/TagList.tsx',
    'src/pages/BookIllustratorList.tsx',
    'src/pages/BookPublisherList.tsx',
    'src/pages/ColoringMediumList.tsx',
    'src/pages/SupportSuccess.tsx',
    'src/pages/ProjectRandomizer.tsx',
    'src/pages/Stats.tsx',
    // /notes is click-interactive (Load more). Missing readiness leaves the
    // startup shell up until the 30s deadline replaces it with #app-error,
    // which intercepts pointer events on a working feed.
    'src/pages/NotesFeedPage.tsx',
    // Auth/data-gated readiness previously kept the splash up while React was
    // already mounted; slow loads could hit the 30s #app-error false positive.
    // These surfaces keep in-app skeletons/spinners and dismiss splash on mount.
    'src/pages/Overview.tsx',
    'src/pages/Dashboard.tsx',
    'src/components/dashboard/ProjectsSection.tsx',
    'src/components/coloring/ColoringDashboardPane.tsx',
    'src/pages/ColoringBookDetail.tsx',
    'src/pages/ColoringPageDetail.tsx',
    'src/pages/Profile.tsx',
  ];

  const splashHideOnlyGates = [
    'src/components/auth/RootRoute.tsx',
    'src/components/auth/ProtectedRoute.tsx',
    'src/components/routing/AppRoutes.tsx',
  ];

  const authFormReadyPages = ['src/pages/Login.tsx', 'src/pages/Register.tsx'];

  it.each(mountReadyPages)('%s dispatches app-ready on mount', (file: string) => {
    const source = getReadinessUsage(readSource(file));

    expect(source).toMatch(/^import useAppReady$/m);
    expect(source).toMatch(/^useAppReady\(\)$/m);
  });

  it.each(splashHideOnlyGates)('%s hides splash without marking ready', (file: string) => {
    const source = getReadinessUsage(readSource(file));

    expect(source).toMatch(/\buseHideSplash\s*\(\s*\)/);
    expect(source).not.toMatch(/\buseAppReady\s*\(/);
  });

  it.each(authFormReadyPages)('%s marks ready only when the auth form is shown', (file: string) => {
    const source = getReadinessUsage(readSource(file));

    expect(source).toMatch(/\buseHideSplash\s*\(\s*authPending\s*\)/);
    expect(source).toMatch(/\buseAppReady\s*\(\s*showAuthForm\s*\)/);
    expect(source).not.toMatch(/\buseAppReady\s*\(\s*\)/);
  });

  it('allows no gated useAppReady callers under src/', () => {
    const gatedCallers = listSrcTsFiles(resolvePath('src'))
      .filter(file => /useAppReady\s*\(\s*!/.test(readSource(file)))
      .sort();

    expect(gatedCallers).toEqual([]);
  });

  it('does not mark Suspense PageLoading fallbacks ready or hide the splash', () => {
    const pageLoading = getReadinessUsage(readSource('src/components/ui/page-loading.tsx'));
    const lazyRoute = getReadinessUsage(
      readSource('src/components/routing/ProtectedLazyRoute.tsx')
    );

    expect(pageLoading).not.toMatch(/\buseAppReady\s*\(/);
    expect(pageLoading).not.toMatch(/\buseHideSplash\s*\(/);
    expect(pageLoading).not.toMatch(/data-app-ready/);
    expect(lazyRoute).not.toMatch(/\buseAppReady\s*\(/);
    expect(lazyRoute).not.toMatch(/\buseHideSplash\s*\(/);
  });

  it('still detects useAppReady after a string that contains //', () => {
    const src = 'const url = "https://cdn.example/js"; useAppReady();\n';
    expect(getReadinessUsage(src)).toMatch(/\buseAppReady\s*\(/);
  });

  it.each([
    "// Don't mark a fallback ready\nuseAppReady();\nconst label = 'Loading';",
    "/* A fallback's readiness stays pending */\nuseAppReady();\nconst label = 'Loading';",
    "const text = <p>Don't hide recovery</p>;\nuseAppReady();\nconst label = 'Loading';",
  ])('detects readiness calls after apostrophes in non-code text: %s', source => {
    expect(getReadinessUsage(source)).toMatch(/\buseAppReady\s*\(/);
  });

  it('detects readiness calls inside template interpolation', () => {
    const source = 'const label = `Loading ${useAppReady() ? "ready" : "pending"}`;';

    expect(getReadinessUsage(source)).toMatch(/\buseAppReady\s*\(/);
  });

  it('ignores readiness names in comments and literals', () => {
    const source = [
      '// useAppReady();',
      '/* useHideSplash(); */',
      'const label = "useAppReady()";',
      "const other = 'useHideSplash()';",
      'const template = `useAppReady()`;',
      'const text = <p>useAppReady()</p>;',
    ].join('\n');

    expect(getReadinessUsage(source)).not.toMatch(/\buse(?:AppReady|HideSplash)\s*\(/);
  });

  it('ignores hook declarations without calls', () => {
    const source = 'function useAppReady() {}\nfunction useHideSplash() {}';

    expect(getReadinessUsage(source)).not.toMatch(/\buse(?:AppReady|HideSplash)\s*\(/);
  });

  it('detects a ready marker on a JSX element', () => {
    expect(getReadinessUsage('const root = <div data-app-ready="true" />;')).toMatch(
      /data-app-ready/
    );
  });

  it('wraps ProtectedRoute inside Suspense and the error boundary outside Suspense', () => {
    const source = readSource('src/components/routing/ProtectedLazyRoute.tsx');
    const protectedWrap = source.indexOf('if (isProtected)');
    const suspenseWrap = source.indexOf("if (suspense !== 'none')");
    const errorWrap = source.indexOf('if (errorBoundary)');

    expect(protectedWrap).toBeGreaterThan(-1);
    expect(suspenseWrap).toBeGreaterThan(protectedWrap);
    expect(errorWrap).toBeGreaterThan(suspenseWrap);
  });
});
