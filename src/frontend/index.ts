import { FRONTEND_HTML, ASSETS } from "./assets";

export function renderFrontend(): Response {
  return new Response(FRONTEND_HTML, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function serveAsset(path: string): Response {
  // Normalize path to ensure it matches the keys in ASSETS
  // Vite assets are usually served with a leading slash.
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const asset = ASSETS.get(normalizedPath);

  if (!asset) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(asset.content, {
    status: 200,
    headers: {
      "content-type": asset.type,
      // Assets usually have hashes in filenames, so we can cache them aggressively
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
