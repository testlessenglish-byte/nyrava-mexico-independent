const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('response', response => {
    if (response.url().includes('/rest/v1/') || response.url().includes('create_and_assign_care_case')) {
      console.log('Intercepted network request:', response.url(), response.status());
    }
  });

  try {
    await page.goto('http://localhost:3000/clients', { waitUntil: 'networkidle' });
    console.log('Navigated to /clients');
    
    // Attempt to interact based on visible text
    // (In a real scenario with auth, we'd need to log in first, but let's assume the local dev server is auto-logged in or session exists)
    const newCaseBtn = page.getByText('New Case', { exact: false });
    if (await newCaseBtn.count() > 0) {
      await newCaseBtn.first().click();
      console.log('Clicked New Case');
    }

    // Try to fill out the form
    await page.getByLabel('New client legal name').fill('Hernandez Test');
    await page.getByLabel('Case type').selectOption({ label: 'Family' });
    await page.getByLabel('Priority').selectOption({ label: 'Standard' });
    
    await page.getByRole('button', { name: 'Open and assign' }).click();
    console.log('Clicked Open and assign');
    
    await page.waitForTimeout(3000); // Wait for potential network requests
    console.log('Test completed');

  } catch (err) {
    console.error('Playwright script error:', err.message);
  } finally {
    await browser.close();
  }
})();
