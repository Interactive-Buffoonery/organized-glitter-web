import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { FILTER_STATUS_ACTIVE_FILL, COLORING_BOOK_STATUS_FILL } from '../src/utils/statusColors.ts';

const palette = Object.fromEntries(
  [
    readFileSync(new URL('../node_modules/tailwindcss/theme.css', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'),
  ].flatMap(css =>
    [...css.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map(([, name, color]) => [name, color])
  )
);
const base = execFileSync('git', ['show', 'origin/dev:src/utils/statusColors.ts'], {
  encoding: 'utf8',
});
const oldFills = Object.fromEntries(
  [...base.matchAll(/^  (\w+): '([^']+)'/gm)].map(([, status, fill]) => [status, fill])
);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const rows = await page.evaluate(
    ({ palette, fills, oldFills }) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const ratio = fill => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = palette[fill];
        ctx.fillRect(0, 0, 1, 1);
        const rgb = [...ctx.getImageData(0, 0, 1, 1).data]
          .slice(0, 3)
          .map(v => v / 255)
          .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 1.05 / (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] + 0.05);
      };
      const fillFor = (classes, dark) => {
        const light = classes.match(/(?:^|\s)bg-([\w-]+)/)?.[1];
        return dark ? (classes.match(/dark:bg-([\w-]+)/)?.[1] ?? light) : light;
      };
      return Object.entries(fills)
        .filter(([status]) => !['everything', 'archived'].includes(status))
        .map(([status, classes]) => ({
          status,
          beforeLight: ratio(fillFor(oldFills[status], false)),
          beforeDark: ratio(fillFor(oldFills[status], true)),
          afterLight: ratio(fillFor(classes, false)),
          afterDark: ratio(fillFor(classes, true)),
        }));
    },
    { palette, fills: { ...FILTER_STATUS_ACTIVE_FILL, ...COLORING_BOOK_STATUS_FILL }, oldFills }
  );
  console.log('| Status | Before light | Before dark | After light | After dark |');
  console.log('| --- | ---: | ---: | ---: | ---: |');
  for (const row of rows) {
    console.log(
      `| ${row.status} | ${row.beforeLight.toFixed(2)} | ${row.beforeDark.toFixed(2)} | ${row.afterLight.toFixed(2)} | ${row.afterDark.toFixed(2)} |`
    );
  }
  if (rows.some(row => row.afterLight < 4.5 || row.afterDark < 4.5)) process.exitCode = 1;
} finally {
  await browser.close();
}
