import { FRONTEND_HTML } from "./assets";

export function renderFrontend(): Response {
  return new Response(FRONTEND_HTML, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
