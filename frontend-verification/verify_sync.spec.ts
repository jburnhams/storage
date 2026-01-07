
import { test, expect } from '@playwright/test';

test('verify sync functionality', async ({ page }) => {
  // Mock User API to simulate logged in state
  await page.route('/api/user', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        profile_picture: null,
        is_admin: true,
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
        last_login_at: null
      })
    });
  });

  // Mock Channel API
  await page.route('**/api/youtube/channel/UC_TEST', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        youtube_id: 'UC_TEST',
        title: 'Test Channel',
        description: 'Test Desc',
        custom_url: 'test',
        thumbnail_url: 'https://via.placeholder.com/150',
        published_at: '2020-01-01',
        statistics: JSON.stringify({ videoCount: '10' }),
        raw_json: '{}',
        created_at: '2023-01-01',
        updated_at: '2023-01-01'
      })
    });
  });

  // Mock Sync API (Initial)
  await page.route('**/api/youtube/channel/UC_TEST/sync', async route => {
      // Simulate delay
      await page.waitForTimeout(500);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
             count: 50,
             range_start: '2023-01-01',
             range_end: '2023-02-01',
             sample_video: { title: 'Synced Video 1', published_at: '2023-01-05', thumbnail_url: 'https://via.placeholder.com/150' },
             is_complete: true // Short circuit for verification
        })
      });
  });

  await page.goto('http://localhost:5173');

  await page.screenshot({ path: 'frontend-verification/debug_initial.png' });

  // Click YouTube Tab
  await page.getByRole('button', { name: 'YouTube' }).click();

  // Switch to Channel
  await page.getByRole('combobox').selectOption('channel');

  // Type Channel ID
  await page.getByPlaceholder('Channel ID').fill('UC_TEST');

  // Click Fetch
  await page.getByRole('button', { name: 'Fetch' }).click();

  // Wait for result
  await expect(page.getByText('Test Channel')).toBeVisible();

  // Click Sync
  await page.getByText('Sync Videos').click();

  // Verify Progress UI
  await expect(page.getByText('Syncing...')).toBeVisible();
  await expect(page.getByText('Total Fetched This Run: 50')).toBeVisible();

  // Take screenshot
  await page.screenshot({ path: 'frontend-verification/screenshot.png' });
});
