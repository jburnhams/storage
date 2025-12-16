const SESSION_COOKIE_NAME = "storage_session";
const STATE_COOKIE_NAME = "oauth_state";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Get the cookie domain based on the request host
 * Returns the root domain for subdomain-wide cookies
 */
function getCookieDomain(request: Request): string {
  const url = new URL(request.url);
  const host = url.hostname;

  // For jonathanburnhams.com and subdomains
  if (host.endsWith("jonathanburnhams.com")) {
    return ".jonathanburnhams.com";
  }

  // For jburnhams.workers.dev and subdomains
  if (host.endsWith("jburnhams.workers.dev")) {
    return ".jburnhams.workers.dev";
  }

  // For localhost development
  if (host === "localhost" || host.startsWith("127.0.0.1")) {
    return host;
  }

  // Default to current host
  return host;
}

/**
 * Set session cookie with security settings
 */
export function setSessionCookie(
  sessionId: string,
  request: Request
): string {
  const domain = getCookieDomain(request);
  const isLocalhost = domain === "localhost" || domain.startsWith("127.0.0.1");

  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${sessionId}`,
    `Domain=${domain}`,
    `Path=/`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];

  // Only add Secure flag for non-localhost (requires HTTPS)
  if (!isLocalhost) {
    cookieParts.push(`Secure`);
  }

  return cookieParts.join("; ");
}

/**
 * Clear session cookie (for logout)
 */
export function clearSessionCookie(request: Request): string {
  const domain = getCookieDomain(request);
  const isLocalhost = domain === "localhost" || domain.startsWith("127.0.0.1");

  const cookieParts = [
    `${SESSION_COOKIE_NAME}=`,
    `Domain=${domain}`,
    `Path=/`,
    `Max-Age=0`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];

  if (!isLocalhost) {
    cookieParts.push(`Secure`);
  }

  return cookieParts.join("; ");
}

/**
 * Get session ID from cookie
 */
export function getSessionIdFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const sessionCookie = cookies.find((c) =>
    c.startsWith(`${SESSION_COOKIE_NAME}=`)
  );

  if (!sessionCookie) {
    return null;
  }

  return sessionCookie.split("=")[1] || null;
}

/**
 * Set OAuth state cookie (short-lived for CSRF protection)
 */
export function setStateCookie(state: string, request: Request): string {
  const domain = getCookieDomain(request);
  const isLocalhost = domain === "localhost" || domain.startsWith("127.0.0.1");

  const cookieParts = [
    `${STATE_COOKIE_NAME}=${state}`,
    `Domain=${domain}`,
    `Path=/`,
    `Max-Age=600`, // 10 minutes
    `HttpOnly`,
    `SameSite=Lax`,
  ];

  if (!isLocalhost) {
    cookieParts.push(`Secure`);
  }

  return cookieParts.join("; ");
}

/**
 * Get OAuth state from cookie
 */
export function getStateFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const stateCookie = cookies.find((c) => c.startsWith(`${STATE_COOKIE_NAME}=`));

  if (!stateCookie) {
    return null;
  }

  return stateCookie.split("=")[1] || null;
}

/**
 * Clear OAuth state cookie
 */
export function clearStateCookie(request: Request): string {
  const domain = getCookieDomain(request);
  const isLocalhost = domain === "localhost" || domain.startsWith("127.0.0.1");

  const cookieParts = [
    `${STATE_COOKIE_NAME}=`,
    `Domain=${domain}`,
    `Path=/`,
    `Max-Age=0`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];

  if (!isLocalhost) {
    cookieParts.push(`Secure`);
  }

  return cookieParts.join("; ");
}
