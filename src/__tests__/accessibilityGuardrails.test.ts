import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROUTES } from '@/components/routing/routeDefinitions';

const readSource = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('accessibility source guardrails', () => {
  it('keeps public header auth actions out of nested Link/Button patterns', () => {
    const source = readSource('src/components/layout/SiteHeader.tsx');

    expect(source).not.toMatch(/<Link\s+to="\/login">\s*<Button/);
    expect(source).not.toMatch(/<Link\s+to="\/register">\s*<Button/);
    expect(source).not.toMatch(/<Button(?![^>]*asChild)[^>]*>\s*<Link[^>]*to="\/login"/);
    expect(source).not.toMatch(/<Button(?![^>]*asChild)[^>]*>\s*<Link[^>]*to="\/register"/);
    expect(source).toMatch(/<Button[^>]*asChild[^>]*variant="ghost"[\s\S]*?<Link to="\/login"/);
    expect(source).toMatch(/<Button[^>]*asChild[^>]*variant="glass"[\s\S]*?<Link to="\/register"/);
  });

  it('keeps audited link-card actions as anchors instead of clickable containers', () => {
    const source = readSource('src/pages/LinksPage.tsx');

    expect(source).not.toMatch(/<(?:Card|div|section)[^>\n]*onClick=/);
    expect(source).toMatch(/<a[\s\S]*href=\{link\.url\}[\s\S]*onClick=/);
    expect(source).toMatch(/<a[\s\S]*href=\{item\.url\}[\s\S]*onClick=/);
  });

  it('keeps dashboard list rows as list items with a native link action', () => {
    const source = readSource('src/components/dashboard/ProjectListRow.tsx');

    expect(source).toMatch(
      /<div role="listitem">\s*<a[\s\S]*href=\{`\/projects\/\$\{project\.id\}`\}/
    );
    expect(source).not.toMatch(/<div[^>]*role="listitem"[^>]*onClick=/);
    expect(source).not.toMatch(/<div[^>]*role="listitem"[^>]*tabIndex=/);
    expect(source).not.toMatch(/<button[\s\S]*<h3/);
    expect(source).toContain('event.ctrlKey');
    expect(source).toContain('event.metaKey');
  });

  it('requires every app route to keep an explicit metadata title', () => {
    expect(APP_ROUTES.length).toBeGreaterThan(0);

    APP_ROUTES.forEach(route => {
      expect(route.metadata?.title, `${route.path} must declare route metadata`).toContain(
        'Organized Glitter'
      );
    });
  });

  it('keeps ColorPicker on the group and toggle-button semantic model', () => {
    const source = readSource('src/components/tags/ColorPicker.tsx');

    expect(source).toContain('role="group"');
    expect(source).toContain('aria-label="Tag color"');
    expect(source).toContain('aria-pressed={selected}');
    expect(source).not.toContain('role="radiogroup"');
    expect(source).not.toContain('role="radio"');
  });
});
