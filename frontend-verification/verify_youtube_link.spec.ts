
import { test, expect } from '@playwright/test';

test('Verify YoutubeViewer channel link in video detail', async ({ page }) => {
  // Mock API responses
  await page.route('**/api/youtube/video/VIDEO123', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        youtube_id: 'VIDEO123',
        title: 'Test Video',
        description: 'Test Description',
        published_at: '2023-01-01T00:00:00Z',
        channel_id: 'CHANNEL123',
        channel_title: 'Test Channel',
        thumbnail_url: 'https://example.com/thumb.jpg',
        duration: 'PT1M',
        statistics: JSON.stringify({ viewCount: 1000 }),
        raw_json: '{}',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      })
    });
  });

  await page.route('**/api/youtube/channel/CHANNEL123', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        youtube_id: 'CHANNEL123',
        title: 'Test Channel Details',
        description: 'Channel Description',
        custom_url: '@testchannel',
        thumbnail_url: 'https://example.com/channel.jpg',
        published_at: '2020-01-01T00:00:00Z',
        statistics: JSON.stringify({ subscriberCount: 500 }),
        raw_json: '{}',
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2020-01-01T00:00:00Z'
      })
    });
  });

  // Mock authentication check to return a valid user session
  await page.route('**/api/user', async (route) => {
      await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
              id: 1,
              email: 'test@example.com',
              name: 'Test User',
              is_admin: true
          })
      });
  });

  // Mock other potential API calls if necessary
  await page.route('**/api/collections', async (route) => {
      await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ collections: [] })
      });
  });

  await page.route('**/api/storage/entry*', async (route) => {
       await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ entries: [], total: 0 })
      });
  });

  await page.route('**/api/youtube/channels', async (route) => {
       await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ channels: [] })
      });
  });


  // Navigate to the app (running on localhost:5173)
  await page.goto('http://localhost:5173/');

  // Click the "YouTube" button from the main navigation (Welcome/Explorer/Collections/YouTube)
  // Based on the snapshot, it is a button with text "YouTube"
  const youtubeButton = page.getByRole('button', { name: 'YouTube', exact: true });
  await youtubeButton.click();

  // Ensure we are in ID fetch mode
  await page.getByText('Fetch ID').click();

  // Select "Video" type
  await page.locator('select').selectOption('video');

  // Enter Video ID
  await page.getByPlaceholder('Video ID').fill('VIDEO123');

  // Click Fetch
  await page.getByText('Fetch', { exact: true }).click();

  // Wait for the result to appear
  await expect(page.getByText('Test Video')).toBeVisible();

  // Verify the "Video by Test Channel" text and link
  const channelLink = page.getByRole('button', { name: 'Test Channel' });
  await expect(channelLink).toBeVisible();
  await expect(page.getByText('Video by')).toBeVisible();

  // Take screenshot of the video detail view
  await page.screenshot({ path: 'frontend-verification/video_detail.png' });

  // Click the channel link
  await channelLink.click();

  // Verify we switched to channel view
  // It should now fetch channel details.
  // The fetchChannelDetail function sets type to 'channel' and id to 'CHANNEL123' and fetches.

  // Wait for channel details
  await expect(page.getByText('Test Channel Details')).toBeVisible();
  // Check that it says "Channel" instead of "Video by ..."
  await expect(page.getByText('Channel • ')).toBeVisible();

  // Take screenshot of the channel detail view
  await page.screenshot({ path: 'frontend-verification/channel_detail.png' });
});
