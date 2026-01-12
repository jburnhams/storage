import time
from playwright.sync_api import sync_playwright

def verify_users_tab():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Mock /api/session to return an admin user
        page.route("**/api/session", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"id":"test-session","user_id":1,"user":{"id":1,"email":"admin@example.com","name":"Admin User","profile_picture":null,"is_admin":true,"created_at":"2023-01-01T00:00:00Z","updated_at":"2023-01-01T00:00:00Z","last_login_at":"2023-01-01T00:00:00Z"}}'
        ))

        # Mock /api/users to return a list of users
        page.route("**/api/users", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='[{"id":1,"email":"admin@example.com","name":"Admin User","profile_picture":null,"is_admin":true,"created_at":"2023-01-01T00:00:00Z","updated_at":"2023-01-01T00:00:00Z","last_login_at":"2023-01-01T00:00:00Z"},{"id":2,"email":"user@example.com","name":"Regular User","profile_picture":null,"is_admin":false,"created_at":"2023-01-02T00:00:00Z","updated_at":"2023-01-02T00:00:00Z","last_login_at":null}]'
        ))

        # Navigate to home
        page.goto("http://localhost:3000/")

        # Wait for loading to finish
        try:
            page.wait_for_selector("text=Loading...", state="detached", timeout=5000)
        except:
            pass

        # Click on "Users" tab
        # Note: The tab text might be "Users"
        page.click("text=Users")

        # Wait for table
        page.wait_for_selector("table.data-table")

        # Take screenshot
        page.screenshot(path="frontend-verification/users_tab.png")
        print("Screenshot saved to frontend-verification/users_tab.png")

        browser.close()

if __name__ == "__main__":
    verify_users_tab()
