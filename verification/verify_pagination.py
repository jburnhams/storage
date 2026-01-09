from playwright.sync_api import sync_playwright, expect
import sys

def test_pagination_max_fix():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Mock APIs
        page.route("**/api/session", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"user": {"id": "1", "username": "admin", "is_admin": true, "avatar_url": "", "created_at": "", "updated_at": ""}, "id": "session_1"}'
        ))

        page.route("**/api/youtube/channels", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"channels": []}'
        ))

        page.route("**/api/youtube/videos*", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"videos": [{"youtube_id": "1", "title": "Test", "published_at": "2023-01-01", "view_count": 0, "like_count": 0, "comment_count": 0}], "total": 0}'
        ))

        try:
            print("Navigating to home...")
            page.goto("http://localhost:5173/")

            print("Waiting for dashboard...")
            expect(page.get_by_role("button", name="Logout")).to_be_visible()

            print("Clicking YouTube tab...")
            page.get_by_role("button", name="YouTube").click()

            print("Switching to Search mode...")
            page.get_by_role("button", name="Search Database").click()

            print("Clicking Search button...")
            # Use exact match or look for the submit button specifically
            search_button = page.get_by_role("button", name="Search", exact=True)
            expect(search_button).to_be_visible()
            search_button.click()

            print("Waiting for pagination input...")
            page_input = page.locator('input[type="number"]')
            expect(page_input).to_be_visible()

            max_val = page_input.get_attribute("max")
            print(f"Max attribute value: {max_val}")

            if max_val != "1":
                print(f"FAILURE: Expected max='1', got '{max_val}'")
                page.screenshot(path="verification/failure.png")
                sys.exit(1)

            page.screenshot(path="verification/youtube_pagination.png")
            print("Success: Pagination max attribute verified.")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
            sys.exit(1)

if __name__ == "__main__":
    test_pagination_max_fix()
