const { test, expect } = require('@playwright/test');

// Enable touch
test.use({ hasTouch: true });

test.describe('Sortable.js touch drag-and-drop', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/index.html?test');
    await page.waitForSelector('.task', { timeout: 5000 });
  });

  test('renders task list without auth', async ({ page }) => {
    const tasks = await page.locator('.task').all();
    expect(tasks.length).toBeGreaterThanOrEqual(2);
  });

  test('Sortable.js is initialized with forceFallback and fallbackClass', async ({ page }) => {
    const config = await page.evaluate(() => {
      const container = document.getElementById('tasks-do-first');
      return window.Sortable.get(container)?.options ?? null;
    });
    expect(config).not.toBeNull();
    expect(config.forceFallback).toBe(true);
    expect(config.fallbackClass).toBe('sortable-drag');
  });

  test('drag ghost element has fallbackClass during simulated touch drag', async ({ page }) => {
    const firstTask = page.locator('.task').first();
    const box = await firstTask.boundingBox();

    await page.waitForTimeout(500);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();

    await page.waitForTimeout(300);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80, { steps: 5 });

    await page.waitForTimeout(100);

    const ghostExists = await page.locator('.sortable-drag').count();

    await page.mouse.up();

    expect(ghostExists).toBeGreaterThan(0);
  });

});
