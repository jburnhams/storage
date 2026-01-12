from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_user_type_dropdown(page: Page):
    # Mock Session
    page.route("**/api/session", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"id":"test-session","user_id":1,"created_at":"","expires_at":"","last_used_at":"","user":{"id":1,"email":"admin@example.com","name":"Admin User","profile_picture":null,"user_type":"ADMIN","is_admin":true,"created_at":"","updated_at":"","last_login_at":null}}'
    ))

    # Mock Users List
    page.route("**/api/users", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='[{"id":1,"email":"admin@example.com","name":"Admin User","profile_picture":null,"user_type":"ADMIN","is_admin":true,"created_at":"","updated_at":"","last_login_at":null}, {"id":2,"email":"guest@example.com","name":"Guest User","profile_picture":null,"user_type":"GUEST","is_admin":false,"created_at":"","updated_at":"","last_login_at":null}]'
    ))

    # Mock Build Metadata
    page.route("**/build-metadata.json", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"timestamp": "2024-05-22"}'
    ))

    page.goto("http://localhost:3000/")

    # Click Users tab
    page.get_by_role("button", name="Users").click()

    # Verify table shows types
    # Use exact match for the badge cell
    expect(page.get_by_role("cell", name="Guest", exact=True)).to_be_visible()

    # Click Add User to open modal
    page.get_by_role("button", name="Add User").click()

    # Check for User Type dropdown
    expect(page.get_by_text("User Type")).to_be_visible()

    # Ensure the select has options
    page.select_option("select", "GUEST")
    page.select_option("select", "STANDARD")
    page.select_option("select", "ADMIN")

    # Screenshot
    page.screenshot(path="frontend-verification/user_type_verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_user_type_dropdown(page)
            print("Verification successful")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="frontend-verification/error.png")
            exit(1)
        finally:
            browser.close()
