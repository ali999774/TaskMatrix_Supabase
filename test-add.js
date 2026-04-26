const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err}`));

  await page.goto('http://localhost:8080');
  
  // Wait for the app to initialize
  await page.waitForTimeout(2000);

  // Type a task and hit Enter
  await page.locator('#quick-add-input').fill('Test Task 123');
  await page.locator('#quick-add-input').press('Enter');

  // Wait for save
  await page.waitForTimeout(2000);

  // Print logs
  console.log("== L O G S ==");
  console.log(logs.join('\n'));
  
  const tasksCount = await page.evaluate(() => window.tasks.length);
  console.log("Tasks count in window:", tasksCount);
  
  // See if count of First Quadrant increased
  const q1text = await page.locator('#count-first').textContent();
  console.log("Q1 Count:", q1text);

  await browser.close();
})();
