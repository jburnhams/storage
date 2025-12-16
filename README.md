# JavaScript Fullstack Template

A production-ready fullstack JavaScript/TypeScript template featuring a React frontend and Cloudflare Workers backend with a simple calculator application example.

## Overview

This template demonstrates a complete fullstack application architecture with:

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Cloudflare Workers (serverless edge computing)
- **Build System**: Automated frontend embedding into worker
- **Testing**: Vitest for both frontend and backend
- **CI/CD**: GitHub Actions workflow

## Features

### Example Application: Calculator

The template includes a working calculator app that demonstrates:

- React form handling and state management
- API calls from frontend to backend
- Backend request validation and error handling
- Type-safe communication between frontend and backend
- Build timestamp injection and display

### Technical Features

- **Type Safety**: Full TypeScript coverage across frontend and backend
- **Single Binary Deploy**: Frontend assets are embedded into the worker
- **Edge Computing**: Sub-millisecond response times via Cloudflare's global network
- **Comprehensive Testing**: Unit tests for business logic and integration tests
- **Modern React**: React 19 with hooks and functional components
- **Build Optimization**: Vite for fast development and optimized production builds

## Project Structure

```
js-fullstack-template/
├── src/                          # Backend source (Cloudflare Worker)
│   ├── worker.ts                 # Main worker entry point & request handler
│   ├── calculator.ts             # Business logic (example)
│   ├── types.ts                  # Shared TypeScript types
│   └── frontend/
│       ├── index.ts              # Frontend serving logic
│       └── assets.ts             # Auto-generated embedded frontend
├── frontend/                     # Frontend React application
│   ├── src/
│   │   ├── main.tsx              # React app entry point
│   │   ├── App.tsx               # Main app component
│   │   ├── types.ts              # Frontend types (mirrors backend)
│   │   ├── styles.css            # Global styles
│   │   ├── build-timestamp.ts    # Build metadata utilities
│   │   ├── components/           # React components
│   │   │   ├── Calculator.tsx    # Calculator form component
│   │   │   └── ResultDisplay.tsx # Result display component
│   │   ├── __tests__/            # Frontend tests
│   │   └── test/
│   │       └── setup.ts          # Test configuration
│   ├── index.html                # HTML template
│   ├── vite.config.ts            # Vite configuration
│   └── tsconfig.json             # Frontend TypeScript config
├── tests/                        # Backend tests
│   ├── worker.test.ts            # Worker integration tests
│   └── calculator.test.ts        # Business logic unit tests
├── scripts/
│   └── embed-frontend.mjs        # Build script to embed frontend
├── .github/
│   └── workflows/
│       └── ci.yml                # GitHub Actions CI pipeline
├── package.json                  # Dependencies and scripts
├── wrangler.toml                 # Cloudflare Workers configuration
├── tsconfig.json                 # Backend TypeScript config
├── vitest.config.ts              # Test configuration
└── .gitignore                    # Git ignore rules
```

## Prerequisites

- **Node.js**: v20.0.0 or higher
- **npm**: Comes with Node.js

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Development

Run the development server with hot reloading:

```bash
npm run dev
```

This starts the Cloudflare Workers development server. Open the URL shown in the terminal (typically http://localhost:8787) to view the app.

The dev server watches for changes in:
- Backend code (`src/`)
- Frontend code (`frontend/`)
- Build scripts (`scripts/`)

### 3. Build

Build the frontend and embed it into the worker:

```bash
npm run build
```

This command:
1. Runs Vite to build the React frontend
2. Inlines all CSS and JavaScript into a single HTML string
3. Generates `src/frontend/assets.ts` with the embedded frontend
4. Replaces `__BUILD_TIMESTAMP__` placeholders with the current timestamp

### 4. Testing

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

### 5. Deploy

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

**Note**: You'll need to configure your Cloudflare account credentials. See [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/) for setup instructions.

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

### `GET /`
Serves the React frontend application.

### `POST /api/calculate`
Performs arithmetic calculations.

**Request Body:**
```json
{
  "a": 5,
  "b": 3,
  "operation": "add"
}
```

**Operations**: `add`, `subtract`, `multiply`, `divide`

**Response:**
```json
{
  "result": 8,
  "operation": "add",
  "operands": { "a": 5, "b": 3 }
}
```

**Error Response:**
```json
{
  "error": "INVALID_OPERATION",
  "message": "Operation must be one of: add, subtract, multiply, divide"
}
```

### `GET /health`
Health check endpoint. Returns `ok` with 200 status.

## Customization Guide

### Adding New API Endpoints

1. Add route handling in `src/worker.ts`:
```typescript
if (url.pathname === "/api/myendpoint") {
  return handleMyEndpoint(request);
}
```

2. Implement handler function
3. Add types to `src/types.ts`
4. Write tests in `tests/`

### Adding New Frontend Components

1. Create component in `frontend/src/components/`
2. Import and use in `App.tsx`
3. Add styles to `styles.css` or component-level CSS
4. Write tests in `frontend/src/__tests__/`

### Modifying Styles

Edit `frontend/src/styles.css`. The template uses CSS variables for theming:

```css
:root {
  --color-primary: #3b82f6;
  --color-bg: #0f172a;
  /* ... more variables */
}
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

## License

This template is provided as-is for use as a starting point for your own projects.

## Support

For issues with:
- **Cloudflare Workers**: See [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)
- **React**: See [React documentation](https://react.dev/)
- **Vite**: See [Vite documentation](https://vitejs.dev/)
- **Vitest**: See [Vitest documentation](https://vitest.dev/)
