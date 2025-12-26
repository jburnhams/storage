import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import type { Env } from './types';
import { corsMiddleware, sessionCleanupMiddleware, errorHandler } from './middleware';
import type { SessionContext } from './middleware';
import { registerAuthRoutes } from './routes/auth';
import { registerUserRoutes } from './routes/users';
import { registerEntryRoutes } from './routes/entries';
import { registerCollectionRoutes } from './routes/collections';
import { registerBulkRoutes, registerPublicRoutes } from './routes/bulk';
import { renderFrontend } from './frontend';

// Create OpenAPI-enabled Hono app
export function createApp() {
  const app = new OpenAPIHono<{
    Bindings: Env;
    Variables: {
      session?: SessionContext;
    };
  }>();

  // Global middleware
  app.use('*', corsMiddleware);
  app.use('*', sessionCleanupMiddleware);

  // Error handler
  app.onError(errorHandler);

  // OpenAPI documentation
  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'Storage API',
      description: 'Cloudflare Worker API for key-value storage with Google OAuth authentication',
    },
    servers: [
      {
        url: 'https://storage.jonathanburnhams.com',
        description: 'Production',
      },
      {
        url: 'http://localhost:8787',
        description: 'Development',
      },
    ],
  });

  // Swagger UI
  app.get('/swagger', swaggerUI({ url: '/openapi.json' }));

  // Register routes
  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerEntryRoutes(app);
  registerCollectionRoutes(app);
  registerBulkRoutes(app);
  registerPublicRoutes(app);

  // Health check
  app.get('/health', (c) => c.text('ok'));

  // Frontend fallback for client-side routing
  app.get('*', (c) => {
    const accept = c.req.header('Accept');
    const path = new URL(c.req.url).pathname;

    // Serve frontend for root path, index.html, or when Accept header indicates HTML
    const isRootPath = path === '/';
    const isIndexHtml = path === '/index.html';
    const wantsHtml = accept?.includes('text/html');
    const isApiRoute = path.startsWith('/api/') || path.startsWith('/auth/');

    if ((isRootPath || isIndexHtml || wantsHtml) && !isApiRoute) {
      return renderFrontend();
    }

    return c.text('Not found', 404);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
