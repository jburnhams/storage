
import { test, expect } from '@playwright/test';

test('verify channel filtering dropdown', async ({ page }) => {
  // Mock the channels API response
  await page.route('*/**/api/youtube/channels', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        channels: [
          { youtube_id: 'UC_TEST_1', title: 'Test Channel One' },
          { youtube_id: 'UC_TEST_2', title: 'Test Channel Two' }
        ]
      })
    });
  });

  // Mock the search API response
  await page.route('*/**/api/youtube/videos*', async route => {
    const url = route.request().url();
    if (url.includes('channel_id=UC_TEST_1')) {
         await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              videos: [
                  {
                      youtube_id: 'vid1',
                      title: 'Video from Channel One',
                      description: 'Desc',
                      published_at: new Date().toISOString(),
                      channel_id: 'UC_TEST_1',
                      thumbnail_url: 'http://via.placeholder.com/150',
                      duration: 'PT1M',
                      statistics: JSON.stringify({ viewCount: 100 }),
                      raw_json: '{}',
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString()
                  }
              ],
              limit: 10,
              offset: 0
            })
          });
    } else {
        // Return empty or default
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              videos: [],
              limit: 10,
              offset: 0
            })
          });
    }
  });

  // Bypass Auth Check in Frontend (Mock user)
  // App.tsx calls /api/user. Note wildcard for host
  await page.route('*/**/api/user', async route => {
     await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test', email: 'test@example.com', is_admin: true })
     });
  });

  await page.goto('http://localhost:5173/');

  // Wait for login loading to finish and dashboard to appear
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible({ timeout: 10000 });

  // Click YouTube Tab
  await page.getByRole('button', { name: 'YouTube' }).click();

  // Switch to Search Database mode
  await page.getByRole('button', { name: 'Search Database' }).click();

  // Wait for channels to load (dropdown to appear)
  const dropdown = page.getByRole('combobox');
  await expect(dropdown).toBeVisible();

  // Select 'Test Channel One'
  await dropdown.selectOption({ label: 'Test Channel One' });

  // Click Search
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  // Verify results
  await expect(page.getByText('Video from Channel One')).toBeVisible();

  // Take screenshot
  await page.screenshot({ path: 'frontend-verification/verification.png' });
});
