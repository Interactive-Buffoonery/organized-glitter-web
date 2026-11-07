import { test, expect } from '@playwright/test';

for (const width of [1071, 390]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    for (const layout of ['centered', 'keyboard-safe', 'keyboard-safe-sheet']) {
      test(`${width} ${reducedMotion} ${layout}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 1030 });
        await page.emulateMedia({ reducedMotion });
        await page.goto(`/e2e/dialog-motion/index.html?layout=${layout}`);
        const trigger = page.getByRole('button', { name: 'Edit test page' });
        await trigger.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused();
        // Seek the actual CSS animations, including their first frame. A class
        // assertion or a settled bounding box would miss the original travel.
        const sample = async () =>
          page.locator('[role="dialog"]').evaluate(element => {
            const animations = element.getAnimations();
            const samples = [];
            for (const time of [0, 25, 50, 100, 150, 199]) {
              for (const animation of animations) {
                animation.pause();
                animation.currentTime = time;
              }
              const rect = element.getBoundingClientRect();
              samples.push({
                time,
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
                opacity: getComputedStyle(element).opacity,
              });
            }
            for (const animation of animations) {
              animation.currentTime = 0;
              animation.play();
            }
            return { samples, animations: animations.length };
          });
        const entrance = await sample();
        if (reducedMotion === 'reduce') expect(entrance.animations).toBe(0);
        else expect(entrance.animations).toBeGreaterThan(0);
        await page.waitForTimeout(250);
        const scroller = dialog.locator('.overflow-y-auto');
        await scroller.evaluate(element => {
          element.scrollTop = 100;
        });
        expect(await scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        if (width === 390) {
          await page.setViewportSize({ width, height: 500 });
          if (layout === 'keyboard-safe-sheet') {
            await expect.poll(async () => (await dialog.boundingBox())?.height).toBe(500);
          }
          await expect(page.getByRole('textbox', { name: 'Title' })).toBeVisible();
          await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
        }
        await page.keyboard.press('Escape');
        const exit = (await page.locator('[role="dialog"]').count()) ? await sample() : null;
        if (reducedMotion === 'no-preference') expect(exit).not.toBeNull();
        await testInfo.attach('motion-samples', {
          body: JSON.stringify({ entrance, exit }, null, 2),
          contentType: 'application/json',
        });
        for (const result of [entrance, exit]) {
          if (!result) continue;
          for (const axis of ['x', 'y'] as const) {
            const values = result.samples.map(s => s[axis]);
            expect(Math.max(...values) - Math.min(...values)).toBeLessThan(1);
          }
        }
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
        await page.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        if (layout !== 'keyboard-safe-sheet' || width > 640) {
          await trigger.click();
          await page.waitForTimeout(250);
          await page.mouse.click(5, 5);
          await expect(dialog).toHaveCount(0);
        }
      });
    }
  }
}

for (const parent of ['dialog', 'drawer']) {
  for (const width of [1071, 390]) {
    test(`nested ${parent} focus at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/e2e/dialog-motion/index.html?nested&parent=${parent}`);
      const outerTrigger = page.getByRole('button', { name: 'Open outer dialog' });
      await outerTrigger.click();
      const outerInput = page.getByRole('textbox', { name: 'Outer value' });
      await expect(outerInput).toBeFocused();
      await outerInput.fill('Keep this draft');
      const innerTrigger = page.getByRole('button', { name: 'Open inner dialog' });
      await innerTrigger.click();
      const inner = page.getByRole('dialog', { name: 'Inner dialog', exact: true });
      const innerInput = inner.getByRole('textbox', { name: 'Inner value' });
      await expect(innerInput).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(inner.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(innerInput).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(inner).toHaveCount(0);
      await expect(innerTrigger).toBeFocused();
      await expect(outerInput).toHaveValue('Keep this draft');
      await innerTrigger.click();
      await inner.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(inner).toHaveCount(0);
      await expect(innerTrigger).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(outerTrigger).toBeFocused();
      await page.getByRole('button', { name: 'Outside control' }).click();
      await expect(page.getByRole('button', { name: 'Outside control' })).toBeFocused();
    });
  }
}
