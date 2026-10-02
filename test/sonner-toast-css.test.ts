import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const closeButtonRule = indexCss.match(
  /\[data-sonner-toaster\] \[data-sonner-toast\]\[data-styled='true'\] \[data-close-button\] \{[^}]*\}/
)?.[0];

describe('Sonner toast CSS contract', () => {
  it('keeps the close control as a right-aligned bare X', () => {
    expect(closeButtonRule).toBeDefined();
    expect(closeButtonRule).toContain('right: 0.75rem !important;');
    expect(closeButtonRule).toContain('left: auto !important;');
    expect(closeButtonRule).toContain('border: 0 !important;');
    expect(closeButtonRule).toContain('background: transparent !important;');
    expect(closeButtonRule).toContain('box-shadow: none !important;');
    expect(closeButtonRule).toContain('transform: none !important;');
  });
});
