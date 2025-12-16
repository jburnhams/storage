# Storage - Centralized Authentication Service

A secure centralized authentication service built with Cloudflare Workers and D1, providing Google OAuth-based authentication for all subdomains under jonathanburnhams.com and jburnhams.workers.dev.

## Overview

Storage is a centralized authentication service that provides:

- **Single Sign-On (SSO)**: One login for all your subdomains
- **Google OAuth**: Secure authentication via Google accounts
- **Session Management**: 7-day sessions with automatic expiration
- **Admin Dashboard**: Manage users and monitor active sessions
- **Database Persistence**: D1 database for user and session storage
- **Secure Cookies**: HttpOnly, Secure, SameSite=Lax cookies scoped to all subdomains

## Features

### Authentication Flow

- **Google OAuth 2.0**: Industry-standard OAuth flow with CSRF protection
- **Subdomain-wide Sessions**: Single session cookie works across all subdomains
- **Automatic User Creation**: New users are automatically created on first login
- **Session Validation API**: Subdomains can validate sessions via API endpoints

### Security Features

- **HttpOnly Cookies**: Prevents XSS attacks by making cookies inaccessible to JavaScript
- **Secure Cookies**: HTTPS-only transmission (except localhost)
- **SameSite=Lax**: CSRF protection via cookie policy
- **State Parameter**: OAuth state validation for CSRF protection
- **Session Expiration**: Automatic cleanup of expired sessions
- **Admin Authorization**: Role-based access control for admin features

### User Management

- **User Profiles**: Email, name, profile picture from Google
- **Admin Roles**: Master admin list + database-based promotion
- **Last Login Tracking**: Monitor user activity
- **User Dashboard**: Users can view their profile and session info
- **Admin Dashboard**: Admins can view all users and active sessions

### Technical Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Cloudflare Workers (serverless edge computing)
- **Database**: Cloudflare D1 (SQLite at the edge)
- **Authentication**: Google OAuth 2.0
- **Build System**: Automated frontend embedding into worker
- **Testing**: Vitest for both frontend and backend
- **CI/CD**: GitHub Actions workflow

## Project Structure

```
storage/
├── src/                          # Backend source (Cloudflare Worker)
│   ├── worker.ts                 # Main worker entry point & auth routes
│   ├── types.ts                  # Shared TypeScript types
│   ├── oauth.ts                  # Google OAuth utilities
│   ├── session.ts                # Session & user management
│   ├── cookie.ts                 # Cookie utilities with security settings
│   └── frontend/
│       ├── index.ts              # Frontend serving logic
│       └── assets.ts             # Auto-generated embedded frontend
├── frontend/                     # Frontend React application
│   ├── src/
│   │   ├── main.tsx              # React app entry point
│   │   ├── App.tsx               # Main app component
│   │   ├── types.ts              # Frontend types
│   │   ├── styles.css            # Global styles
│   │   └── components/           # React components
│   │       ├── LoginPage.tsx     # Google OAuth login page
│   │       ├── UserDashboard.tsx # User profile & session info
│   │       ├── AdminDashboard.tsx# Admin panel (users & sessions)
│   │       └── BuildTimestampBadge.tsx
│   ├── index.html                # HTML template
│   ├── vite.config.ts            # Vite configuration
│   └── tsconfig.json             # Frontend TypeScript config
├── migrations/                   # D1 database migrations
│   └── 0001_create_users_and_sessions.sql
├── tests/                        # Backend tests
├── scripts/
│   └── embed-frontend.mjs        # Build script to embed frontend
├── package.json                  # Dependencies and scripts
├── wrangler.toml                 # Cloudflare Workers & D1 configuration
└── tsconfig.json                 # Backend TypeScript config
```

## Prerequisites

- **Node.js**: v20.0.0 or higher
- **npm**: Comes with Node.js
- **Cloudflare Account**: Free tier available at [cloudflare.com](https://cloudflare.com)
- **Google OAuth Credentials**: Create at [Google Cloud Console](https://console.cloud.google.com)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Select "Web application" as the application type
6. Add authorized redirect URIs:
   - `https://storage.jonathanburnhams.com/auth/callback`
   - `https://storage.jburnhams.workers.dev/auth/callback`
   - `http://localhost:8787/auth/callback` (for local development)
7. Save your **Client ID** and **Client Secret**

### 3. Configure D1 Database

Create a D1 database for production:

```bash
# Create the database
npx wrangler d1 create storage-db

# Note the database_id from the output and update wrangler.toml
```

Update `wrangler.toml` with your actual `database_id` (replace `preview_database_id`).

Run migrations:

```bash
# For local development
npx wrangler d1 execute storage-db --local --file=./migrations/0001_create_users_and_sessions.sql

# For production
npx wrangler d1 execute storage-db --remote --file=./migrations/0001_create_users_and_sessions.sql
```

### 4. Configure Secrets

Set up your secrets using Wrangler:

```bash
# Google OAuth Client ID
npx wrangler secret put GOOGLE_CLIENT_ID
# Paste your Google OAuth Client ID when prompted

# Google OAuth Client Secret
npx wrangler secret put GOOGLE_CLIENT_SECRET
# Paste your Google OAuth Client Secret when prompted

# Session Secret (generate a random 32-byte hex string)
openssl rand -hex 32
npx wrangler secret put SESSION_SECRET
# Paste the generated secret when prompted
```

For local development, create a `.dev.vars` file (don't commit this):

```bash
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
SESSION_SECRET=your_session_secret_here
```

### 5. Configure Admin Emails

Edit `src/session.ts` and add your admin email addresses to the `MASTER_ADMIN_EMAILS` array:

```typescript
const MASTER_ADMIN_EMAILS = [
  "your-email@example.com",
  // Add more admin emails here
];
```

### 6. Development

Run the development server with hot reloading:

```bash
npm run dev
```

This starts the Cloudflare Workers development server. Open http://localhost:8787 to view the app.

The dev server watches for changes in:
- Backend code (`src/`)
- Frontend code (`frontend/`)
- Build scripts (`scripts/`)

### 7. Build

Build the frontend and embed it into the worker:

```bash
npm run build
```

This command:
1. Runs Vite to build the React frontend
2. Inlines all CSS and JavaScript into a single HTML string
3. Generates `src/frontend/assets.ts` with the embedded frontend
4. Replaces `__BUILD_TIMESTAMP__` placeholders with the current timestamp

### 8. Testing

Run tests in watch mode:

```bash
npm test
```

Run tests once with coverage:

```bash
npm run test:coverage
```

Tests include:
- **Backend tests**: API endpoints, business logic, request handling
- **Frontend tests**: React components, user interactions, utilities

### 9. Deploy

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

Make sure you've configured all secrets (step 4) before deploying.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build and embed frontend into worker |
| `npm test` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run deploy` | Deploy to Cloudflare Workers |

## Technologies Used

### Frontend
- **React 19**: UI library with modern hooks API
- **TypeScript**: Type-safe JavaScript
- **Vite**: Fast build tool and dev server
- **CSS**: Custom CSS with CSS variables for theming

### Backend
- **Cloudflare Workers**: Serverless edge computing platform
- **TypeScript**: Type-safe server-side code
- **Web APIs**: Standard Request/Response APIs

### Testing
- **Vitest**: Fast unit test framework
- **Testing Library**: React component testing utilities
- **jsdom**: DOM implementation for Node.js

### Build & CI
- **Vite**: Frontend bundler and optimizer
- **Wrangler**: Cloudflare Workers CLI
- **GitHub Actions**: Automated CI pipeline

## API Endpoints

### Authentication Routes

#### `GET /`
Serves the React frontend application (login page or dashboard).

#### `GET /auth/login`
Initiates Google OAuth flow. Redirects user to Google login.

#### `GET /auth/callback`
OAuth callback endpoint. Handles Google OAuth response, creates user/session, and sets session cookie.

#### `GET /auth/logout`
Logs out the current user by deleting their session and clearing the session cookie.

### API Routes (for subdomain integration)

#### `GET /api/session`
Returns current session information with user data. Use this endpoint from your subdomains to validate authentication.

**Response (authenticated):**
```json
{
  "id": "session_id_here",
  "user_id": 1,
  "created_at": "2025-12-16T10:00:00.000Z",
  "expires_at": "2025-12-23T10:00:00.000Z",
  "last_used_at": "2025-12-16T10:00:00.000Z",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "profile_picture": "https://...",
    "is_admin": false,
    "created_at": "2025-12-16T10:00:00.000Z",
    "updated_at": "2025-12-16T10:00:00.000Z",
    "last_login_at": "2025-12-16T10:00:00.000Z"
  }
}
```

**Response (unauthenticated):**
```json
{
  "error": "UNAUTHORIZED",
  "message": "No session found"
}
```

#### `GET /api/user`
Returns current authenticated user information.

**Response:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "profile_picture": "https://...",
  "is_admin": false,
  "created_at": "2025-12-16T10:00:00.000Z",
  "updated_at": "2025-12-16T10:00:00.000Z",
  "last_login_at": "2025-12-16T10:00:00.000Z"
}
```

### Admin Routes (require admin role)

#### `GET /api/users`
Returns all users. Admin only.

**Response:**
```json
[
  {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "profile_picture": "https://...",
    "is_admin": false,
    "created_at": "2025-12-16T10:00:00.000Z",
    "updated_at": "2025-12-16T10:00:00.000Z",
    "last_login_at": "2025-12-16T10:00:00.000Z"
  }
]
```

#### `GET /api/sessions`
Returns all active sessions with user data. Admin only.

**Response:**
```json
[
  {
    "id": "session_id_here",
    "user_id": 1,
    "created_at": "2025-12-16T10:00:00.000Z",
    "expires_at": "2025-12-23T10:00:00.000Z",
    "last_used_at": "2025-12-16T10:00:00.000Z",
    "user": { /* user object */ }
  }
]
```

#### `POST /api/admin/promote`
Promotes a user to admin. Admin only.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true
}
```

### `GET /health`
Health check endpoint. Returns `ok` with 200 status.

## Using from Your Subdomains

### Session Validation

From any subdomain webapp, you can validate the user's session by calling the `/api/session` endpoint:

```javascript
// Check if user is authenticated
fetch('https://storage.jonathanburnhams.com/api/session', {
  credentials: 'include' // Important: include cookies
})
  .then(res => res.json())
  .then(data => {
    if (data.user) {
      console.log('User is authenticated:', data.user);
      // User is logged in, proceed with your app
    } else {
      // User is not authenticated, redirect to login
      window.location.href = 'https://storage.jonathanburnhams.com/auth/login';
    }
  });
```

### Cookie Configuration

The session cookie is automatically scoped to:
- `.jonathanburnhams.com` (all subdomains)
- `.jburnhams.workers.dev` (all worker subdomains)

This means once a user logs in, the session cookie is automatically sent with requests from any subdomain.

### Redirecting to Login

To send users to the login page:

```javascript
window.location.href = 'https://storage.jonathanburnhams.com/auth/login';
```

After successful login, users are redirected back to the auth service dashboard. You may want to implement a `redirect_uri` parameter to send users back to your subdomain after login.

## Database Migrations

### Creating New Migrations

1. Create a new SQL file in the `migrations/` directory:
   - Name it with the pattern: `XXXX_description.sql` (e.g., `0002_add_user_preferences.sql`)

2. Write your migration SQL:
```sql
-- Add new column
ALTER TABLE users ADD COLUMN preferences TEXT;

-- Create index
CREATE INDEX idx_users_preferences ON users(preferences);
```

3. Apply the migration:
```bash
# Local
npx wrangler d1 execute storage-db --local --file=./migrations/XXXX_description.sql

# Production
npx wrangler d1 execute storage-db --remote --file=./migrations/XXXX_description.sql
```

### Viewing Database Contents

```bash
# Local database
npx wrangler d1 execute storage-db --local --command="SELECT * FROM users"

# Production database
npx wrangler d1 execute storage-db --remote --command="SELECT * FROM users"
```

## CI/CD Pipeline

The included GitHub Actions workflow (`.github/workflows/ci.yml`) runs on:
- Push to `main` branch
- Pull requests

Pipeline steps:
1. Checkout code
2. Setup Node.js (tests against versions 20.x, 22.x, 24.x, 25.x)
3. Install dependencies
4. Build project
5. Run tests
6. Generate coverage report

## Build Process Details

The build process embeds the entire frontend into the worker:

1. **Vite Build**: Compiles React/TypeScript to optimized JavaScript
2. **Asset Inlining**: CSS and JS are inlined into the HTML
3. **Code Generation**: Creates `src/frontend/assets.ts` with embedded HTML
4. **Timestamp Injection**: Replaces placeholders with build timestamp

This results in a single-file deployment with no external assets, enabling:
- Fast cold starts
- No CDN configuration needed
- Atomic deployments
- Maximum portability

## Security Considerations

### Cookie Security
- **HttpOnly**: Prevents JavaScript access to cookies (XSS protection)
- **Secure**: Cookies only sent over HTTPS (except localhost)
- **SameSite=Lax**: Protection against CSRF attacks
- **Domain Scoping**: Cookies scoped to all subdomains

### OAuth Security
- **State Parameter**: CSRF protection during OAuth flow
- **HTTPS Only**: OAuth callback only works over HTTPS in production
- **Token Storage**: Access tokens are never stored, only used during callback

### Session Security
- **7-Day Expiration**: Sessions automatically expire after 7 days
- **Automatic Cleanup**: Expired sessions are cleaned up in the background
- **Session Validation**: Sessions validated on every request
- **Secure Session IDs**: Cryptographically secure random session IDs

### Admin Security
- **Master Admin List**: Hardcoded list of admin emails in code
- **Database Admin Flag**: Additional admins can be promoted via admin panel
- **Role-Based Access**: Admin-only endpoints check authorization
- **Audit Trail**: Created/updated timestamps on all records

### Best Practices
1. Keep your `SESSION_SECRET` secure and never commit it to version control
2. Regularly rotate your Google OAuth credentials
3. Monitor the admin dashboard for suspicious activity
4. Keep your dependencies up to date
5. Use HTTPS for all production deployments

## Support

For issues with:
- **Cloudflare Workers**: See [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)
- **Cloudflare D1**: See [D1 documentation](https://developers.cloudflare.com/d1/)
- **React**: See [React documentation](https://react.dev/)
- **Vite**: See [Vite documentation](https://vitejs.dev/)
- **Google OAuth**: See [Google OAuth 2.0 documentation](https://developers.google.com/identity/protocols/oauth2)
