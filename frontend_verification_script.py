from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_collections_and_files(page: Page):
    # Mock auth by setting cookie directly
    # Note: We need a valid session ID. In integration tests we used seeded data.
    # Here we are running against local dev server which might be empty or persistent.
    # We can try to rely on the dev server being fresh or having some data.
    # But for visual verification, we might just look at the login page if not authenticated,
    # OR we can assume we can login.

    # Let's try to hit the page. If redirected to login, that's fine for now,
    # but we really want to see the new UI components (Collections tab, toggles).

    # To bypass auth for visual check, we might need a test mode or just login.
    # Login requires Google Auth which is hard to automate without credentials.

    # Ideally, we should mock the /api/user endpoint response or similar via Playwright network interception.

    # Intercept /api/user to return a mock user
    page.route("/api/user", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"id":1,"email":"test@example.com","name":"Test User","is_admin":true,"created_at":"2023-01-01T00:00:00Z","updated_at":"2023-01-01T00:00:00Z","last_login_at":null}'
    ))

    # Intercept /api/collections
    page.route("/api/collections", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='[{"id":1,"name":"Test Collection","description":"A test collection","secret":"abc","user_id":1,"created_at":"2023-01-01","updated_at":"2023-01-01"}]'
    ))

    # Intercept /api/storage/entries
    page.route("/api/storage/entries?*", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='[{"id":1,"key":"file1.txt","string_value":"content","has_blob":false,"secret":"s1","type":"text/plain","filename":null,"user_id":1,"collection_id":null,"created_at":"2023-01-01","updated_at":"2023-01-01"},{"id":2,"key":"col/file2.txt","string_value":"content","has_blob":false,"secret":"s2","type":"text/plain","filename":null,"user_id":1,"collection_id":1,"created_at":"2023-01-01","updated_at":"2023-01-01"}]'
    ))

    page.goto("http://localhost:8787")

    # Expect Tabs
    expect(page.get_by_text("Explorer")).to_be_visible()
    expect(page.get_by_text("Collections")).to_be_visible()

    # Check Explorer View
    expect(page.get_by_text("Show collection files")).to_be_visible()

    # Click toggle
    page.get_by_label("Show collection files").check()

    # Check Collections View
    page.get_by_text("Collections").click()
    expect(page.get_by_text("Test Collection")).to_be_visible()

    # Click browse
    page.get_by_text("Browse").click()
    expect(page.get_by_text("← Back to Collections")).to_be_visible()

    # Take screenshot
    page.screenshot(path="/home/jules/verification/collections_verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_collections_and_files(page)
        finally:
            browser.close()
