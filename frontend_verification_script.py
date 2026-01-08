from playwright.sync_api import sync_playwright, expect
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Mock /api/user to simulate logged in user
        page.route("**/api/user", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"id": "test-user", "email": "test@example.com", "is_admin": true, "created_at": "2023-01-01"}'
        ))

        # Mock channels
        page.route("**/api/youtube/channels", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"channels": [{"youtube_id": "UC123", "title": "Test Channel"}]}'
        ))

        # Mock videos search
        page.route("**/api/youtube/videos*", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='''
            {
                "videos": [
                    {
                        "youtube_id": "vid1",
                        "title": "Video 1",
                        "description": "Desc 1",
                        "published_at": "2023-01-01T00:00:00Z",
                        "channel_id": "UC123",
                        "channel_title": "Test Channel",
                        "thumbnail_url": "https://example.com/thumb.jpg",
                        "duration": "10:00",
                        "statistics": "{\\"viewCount\\": \\"1000\\"}",
                        "raw_json": "{}",
                        "created_at": "2023-01-01T00:00:00Z",
                        "updated_at": "2023-01-01T00:00:00Z"
                    }
                ],
                "limit": 10,
                "offset": 0,
                "total": 105
            }
            '''
        ))

        page.goto("http://localhost:4173")

        # Wait for loading to finish and dashboard to appear
        expect(page.get_by_text("Storage Auth Service")).to_be_visible()

        # Click YouTube tab
        page.get_by_role("button", name="YouTube").click()

        # Click "Search Database" to switch mode
        page.get_by_text("Search Database").click()

        # Click Search button to trigger initial search (exact match to avoid ambiguity with "Search Database")
        page.get_by_role("button", name="Search", exact=True).click()

        # Verify "Total Results" text
        expect(page.get_by_text("Total Results:")).to_be_visible()
        expect(page.get_by_text("105")).to_be_visible()

        # Verify Pagination controls
        expect(page.get_by_role("button", name="First")).to_be_visible()
        expect(page.get_by_role("button", name="Previous")).to_be_visible()
        expect(page.get_by_role("button", name="Next")).to_be_visible()
        expect(page.get_by_role("button", name="Last")).to_be_visible()

        # Verify Page Size selector (using nth(1) as it is the second select on the page, after channel filter)
        page_size_select = page.locator("select").nth(1)
        expect(page_size_select).to_have_value("10")

        page.screenshot(path="frontend-verification/youtube_search_pagination.png")

        browser.close()

if __name__ == "__main__":
    run()
