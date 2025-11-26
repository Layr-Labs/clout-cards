/**
 * Twitter OAuth service
 *
 * Provides functions for Twitter OAuth 2.0 authentication flow.
 * Handles authorization URL generation, token exchange, and user info retrieval.
 */

import crypto from 'crypto';

/**
 * Generates SHA256 hash of code verifier for PKCE
 *
 * Hashes the code verifier using SHA256 and encodes it as base64url
 * (base64 with URL-safe characters: - and _ instead of + and /, no padding).
 *
 * @param codeVerifier - PKCE code verifier string
 * @returns Base64url-encoded SHA256 hash of the code verifier
 */
function generateCodeChallenge(codeVerifier: string): string {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return hash.toString('base64url');
}

/**
 * Generates Twitter OAuth 2.0 authorization URL
 *
 * Creates the URL that users should be redirected to for Twitter authentication.
 * Uses PKCE (Proof Key for Code Exchange) flow with SHA256 hashing for security.
 *
 * @param redirectUri - Callback URL where Twitter will redirect after authorization
 * @param state - Random state string for CSRF protection
 * @param codeVerifier - PKCE code verifier (should be stored in session)
 * @returns Authorization URL string
 */
export function getTwitterAuthUrl(redirectUri: string, state: string, codeVerifier: string): string {
  const clientId = process.env.TWITTER_CLIENT_ID;
  if (!clientId) {
    throw new Error('TWITTER_CLIENT_ID environment variable is not set');
  }

  // Generate code challenge using SHA256 hash
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'tweet.read users.read offline.access',
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchanges authorization code for access token
 *
 * After user authorizes, Twitter redirects with a code. This function
 * exchanges that code for an access token.
 *
 * @param code - Authorization code from Twitter callback
 * @param redirectUri - Same redirect URI used in authorization request
 * @param codeVerifier - PKCE code verifier (must match the one used in auth URL)
 * @returns Promise that resolves to access token and refresh token
 * @throws {Error} If token exchange fails
 */
export async function exchangeTwitterCode(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET environment variables are required');
  }

  // Create basic auth header
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      code: code,
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange Twitter code: ${response.status} ${errorText}`);
  }

  const data = await response.json() as { access_token: string; refresh_token: string };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

/**
 * Gets Twitter user information from access token
 *
 * Retrieves the authenticated user's Twitter profile information.
 *
 * @param accessToken - Twitter OAuth access token
 * @returns Promise that resolves to user info (id, username, name, profile_image_url)
 * @throws {Error} If API request fails
 */
export async function getTwitterUserInfo(accessToken: string): Promise<{
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
}> {
  const response = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Twitter user info: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    data: {
      id: string;
      username: string;
      name: string;
      profile_image_url?: string;
    };
  };
  return {
    id: data.data.id,
    username: data.data.username,
    name: data.data.name,
    profile_image_url: data.data.profile_image_url,
  };
}

/**
 * Generates a random string for PKCE code verifier
 *
 * @param length - Length of the string (default: 128)
 * @returns Random string suitable for PKCE code verifier
 */
export function generateCodeVerifier(length: number = 128): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

/**
 * Generates a random state string for CSRF protection
 *
 * @param length - Length of the string (default: 32)
 * @returns Random state string
 */
export function generateState(length: number = 32): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

