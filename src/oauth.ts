import type { Env, GoogleTokenResponse, GoogleUserInfo } from "./types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/**
 * Generate OAuth state parameter for CSRF protection
 */
export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

/**
 * Encode state with optional redirect URL
 */
export function encodeState(nonce: string, redirectUrl?: string): string {
  const stateObj = { nonce, redirect: redirectUrl };
  const json = JSON.stringify(stateObj);
  // Handle Unicode characters safely
  const encoded = btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g,
      function toSolidBytes(match, p1) {
          return String.fromCharCode(parseInt(p1, 16));
  }));
  return encoded;
}

/**
 * Decode state to retrieve nonce and redirect URL
 */
export function decodeState(state: string): { nonce: string; redirect?: string } {
  try {
    const decoded = atob(state);
    const json = decodeURIComponent(decoded.split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const obj = JSON.parse(json);
    return {
      nonce: obj.nonce,
      redirect: obj.redirect,
    };
  } catch (e) {
    // Fallback for legacy states or invalid formats (though we shouldn't have legacy states in a stateless random generation, existing cookies might have old format if we just deployed)
    // If decoding fails, treat the whole string as the nonce (legacy behavior)
    return { nonce: state };
  }
}

/**
 * Get the redirect URI based on the request host
 */
export function getRedirectUri(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/auth/callback`;
}

/**
 * Generate Google OAuth authorization URL
 */
export function getGoogleAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: state,
    access_type: "online",
    prompt: "select_account",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  env: Env
): Promise<GoogleTokenResponse> {
  const params = {
    code: code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  };

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    const error = await response.text();

    // Mask sensitive fields for logging
    const debugParams = { ...params };
    const mask = (str: string | undefined) => {
        if (!str) return "undefined";
        if (str.length <= 6) return "***";
        return str.substring(0, 3) + "..." + str.substring(str.length - 3);
    };

    debugParams.code = mask(debugParams.code);
    debugParams.client_secret = mask(debugParams.client_secret);

    throw new Error(`Failed to exchange code for token: ${error}\nRequest params: ${JSON.stringify(debugParams, null, 2)}`);
  }

  return await response.json();
}

/**
 * Get user info from Google using access token
 */
export async function getGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get user info: ${error}`);
  }

  return await response.json();
}
