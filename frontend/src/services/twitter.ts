/**
 * Twitter service for frontend
 *
 * Provides functions to interact with backend Twitter OAuth endpoints.
 */

import { getBackendUrl } from '../config/env';

/**
 * Twitter user information
 */
export interface TwitterUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
}

/**
 * Initiates Twitter OAuth flow
 *
 * Redirects the user to Twitter authorization page.
 * After authorization, Twitter will redirect back to the backend callback URL.
 * The backend then redirects to the frontend with a session ID.
 *
 * @param redirectUri - Deprecated: No longer used. Backend always uses its own callback URL.
 */
export function initiateTwitterAuth(redirectUri?: string): void {
  const backendUrl = getBackendUrl();
  // Backend handles the redirect_uri internally - always uses backend callback URL
  const url = `${backendUrl}/twitter/auth`;
  
  // Redirect to backend auth endpoint, which will redirect to Twitter
  window.location.href = url;
}

/**
 * Gets Twitter user info from access token
 *
 * @param accessToken - Twitter OAuth access token
 * @returns Promise that resolves to Twitter user information
 * @throws {Error} If the request fails or token is invalid
 */
export async function getTwitterUser(accessToken: string): Promise<TwitterUser> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/twitter/user`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to get Twitter user: ${response.status} ${response.statusText}`
    );
  }

  const user: TwitterUser = await response.json();
  return user;
}

