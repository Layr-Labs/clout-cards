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
 * Gets Twitter user information from access token
 *
 * Uses localStorage cache to avoid excessive API calls and handle rate limiting.
 * Cache expires after 1 hour.
 *
 * @param accessToken - Twitter OAuth access token
 * @returns Promise that resolves to Twitter user info
 * @throws {Error} If API request fails
 */
export async function getTwitterUser(accessToken: string): Promise<TwitterUser> {
  // Check localStorage cache first
  const cacheKey = `twitter_user_${accessToken.substring(0, 20)}`;
  const cachedStr = localStorage.getItem(cacheKey);
  if (cachedStr) {
    try {
      const cached = JSON.parse(cachedStr) as { userInfo: TwitterUser; expiresAt: number };
      if (Date.now() < cached.expiresAt) {
        return cached.userInfo;
      }
      // Cache expired, remove it
      localStorage.removeItem(cacheKey);
    } catch (error) {
      // Invalid cache, remove it
      localStorage.removeItem(cacheKey);
    }
  }

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
    
    // If rate limited, try to return cached data even if expired
    if (response.status === 429) {
      if (cachedStr) {
        try {
          const cached = JSON.parse(cachedStr) as { userInfo: TwitterUser; expiresAt: number };
          console.warn('⚠️  Twitter API rate limit hit. Using cached user info.');
          return cached.userInfo;
        } catch {
          // Cache invalid, fall through to error
        }
      }
      throw new Error('Twitter API rate limit exceeded. Please try again later.');
    }
    
    throw new Error(
      errorData.message || `Failed to get Twitter user: ${response.status} ${response.statusText}`
    );
  }

  const user: TwitterUser = await response.json();

  // Cache the result for 1 hour
  localStorage.setItem(cacheKey, JSON.stringify({
    userInfo: user,
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
  }));

  return user;
}

