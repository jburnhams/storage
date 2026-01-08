# Authentication Guide for React SPAs

This service acts as a centralized authentication provider. Other React SPAs hosted on allowed domains (e.g., subdomains of `jonathanburnhams.com`) can use it to authenticate users.

## 1. Checking Authentication Status

To check if a user is currently authenticated, make a GET request to `/api/user`.

**Important**: You must include `credentials: 'include'` in your fetch options to send the session cookie.

```javascript
try {
  const response = await fetch('https://storage.jonathanburnhams.com/api/user', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Required to send cookies
  });

  if (response.ok) {
    const user = await response.json();
    console.log('User is logged in:', user);
  } else if (response.status === 401) {
    const data = await response.json();
    handleUnauthorized(data);
  }
} catch (error) {
  console.error('Network error:', error);
}
```

### Successful Response (200 OK)

If the user is authenticated, the API returns the user object:

```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "picture": "https://lh3.googleusercontent.com/...",
  "is_admin": false,
  "created_at": "2023-10-27T10:00:00Z",
  "last_login_at": "2023-10-28T10:00:00Z"
}
```

### Unauthorized Response (401 Unauthorized)

If the user is not authenticated, the API returns a 401 status with a `login_url` field.

```json
{
  "error": "UNAUTHORIZED",
  "message": "Session expired or invalid",
  "login_url": "https://storage.jonathanburnhams.com/auth/login?redirect=https%3A%2F%2Fyour-app.jonathanburnhams.com%2Fdashboard"
}
```

The `login_url` is automatically constructed based on the `Referer` header sent by your browser. It includes a `redirect` query parameter pointing back to the page that made the request.

## 2. Handling Login

When you receive a 401 response, you should redirect the user's browser to the provided `login_url`.

```javascript
function handleUnauthorized(data) {
  if (data.login_url) {
    // Redirect the browser to the centralized login page
    window.location.href = data.login_url;
  }
}
```

### The Login Flow

1.  **Redirect**: The user is taken to `https://storage.jonathanburnhams.com/auth/login`.
2.  **OAuth**: The user authenticates with Google.
3.  **Callback**: After success, the server sets a global session cookie (`storage_session`) valid for all subdomains.
4.  **Return**: The user is redirected back to the URL specified in the `redirect` parameter (e.g., your app).

### Custom Redirects

If you need to redirect the user to a specific page after login (different from the current page), you can manually construct the login URL:

```javascript
const returnUrl = 'https://your-app.jonathanburnhams.com/specific-page';
const loginUrl = `https://storage.jonathanburnhams.com/auth/login?redirect=${encodeURIComponent(returnUrl)}`;
window.location.href = loginUrl;
```

**Note**: The redirect URL must be on an allowed domain (e.g., `*.jonathanburnhams.com`, `localhost`).

## 3. Logout

To log out, send a POST request to `/auth/logout`.

```javascript
await fetch('https://storage.jonathanburnhams.com/auth/logout', {
  method: 'POST',
  credentials: 'include',
});
// Then redirect to home or refresh
window.location.href = '/';
```
